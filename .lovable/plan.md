
## Goal

Make `generate-diagnostic-questions` produce only well-formed MCQs by enforcing strict semantic validation, retrying per tier until each tier hits its target, and only writing to the database after all tiers pass.

## Scope

Edits limited to:
- `supabase/functions/generate-diagnostic-questions/index.ts` (the only behavioral change)
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` (small UI cleanup — MCQ-only display, regen confirmation, surface partial-success info)

No DB schema changes. No changes to other edge functions. No JWT/config.toml changes in this revision.

---

## Step 1 — MCQ-only generation

In the edge function:

- **Prompt**: instruct the model to generate **only MCQ** questions. Drop `true_false` and `short_answer` from the spec, examples, and rules.
- **Tool schema**: restrict `format` enum to `["mcq"]`. Require `options` to be a non-null array of exactly 4 strings. Keep `answer`, `topic`, `difficulty_estimate`, `bloom_level`, `explanation`, `content_text` required.
- **Model**: keep `google/gemini-2.5-flash` (no model change in this revision).

## Step 2 — Strict semantic validator

A pure function `validateMcq(q, spec, conceptByCode)` returning `{ ok: true, normalized } | { ok: false, reason }`. Run on every returned question. Drop any that fail.

Checks (all must pass):

1. `format === "mcq"`.
2. `content_text` is a non-empty string ≤ 600 chars after trim.
3. `options` is an array of exactly 4 unique, non-empty strings (trim-compared, case-sensitive uniqueness).
4. `answer` is a non-empty string AND matches exactly one option (trim-compared, case-sensitive).
5. `topic` is present in the `conceptByCode` map. Otherwise drop (no orphan rows with `concept_id: null`).
6. `difficulty_estimate` numeric and within `[spec.difficulty − 0.2, spec.difficulty + 0.2]` after clamp to `[0, 1]`.
7. `bloom_level` integer in `[1, 6]`.
8. `explanation` non-empty string.

Drop reasons are accumulated for diagnostics (not surfaced to the student-facing UI).

## Step 3 — Per-tier retry loop

Replace the single `Promise.all(tierPromises)` with a per-tier resilient flow.

```text
for each tier in TIER_SPEC (run in parallel via Promise.allSettled):
  accepted = []
  attempts = 0
  while accepted.length < spec.count AND attempts < MAX_ATTEMPTS (3):
    attempts++
    needed = spec.count - accepted.length
    questions = await callGateway(spec, needed, attemptHints)
      // attemptHints: on retry, append "Previous batch had N invalid questions. Common issues: <top reasons>. Generate {needed} new MCQs avoiding these issues."
    for q in questions:
      result = validateMcq(q, spec, conceptByCode)
      if result.ok AND not duplicateContent(result.normalized, accepted):
        accepted.push(result.normalized)
        if accepted.length === spec.count: break
  return { tier, accepted, attempts, requested: spec.count }
```

- `duplicateContent` = case-insensitive equality on first 120 chars of `content_text`.
- `MAX_ATTEMPTS = 3`. Per-attempt gateway request `temperature: 0.4` for variety.
- Use `Promise.allSettled` so a single tier's exhaustion does not abort the others.

## Step 4 — All-or-nothing persistence

**Do not delete or insert anything until every tier has reached its full target count.**

- Compute final `tierResults`. Required: every tier has `accepted.length === spec.count` (i.e., 5 each, total 20).
- If any tier short:
  - Return HTTP **422** with body `{ error, breakdown: [{ tier, accepted, requested, attempts, sampleReasons }] }`.
  - **Do not touch `diagnostic_questions`.** Existing rows preserved.
- If all tiers full:
  - In a single logical step: `delete().eq("course_id", courseId)` then `insert(rows)`.
  - On insert error, return 500; existing rows already deleted (acceptable trade-off given prior contract — note in response).

This guarantees the table is never left with a partial regenerated set.

## Step 5 — Response shape

Success (200):
```json
{
  "message": "Generated 20 diagnostic questions",
  "breakdown": [
    { "tier": "standard", "accepted": 5, "requested": 5, "attempts": 1 },
    ...
  ]
}
```

Failure (422 — partial):
```json
{
  "error": "Could not produce a complete diagnostic set after retries.",
  "breakdown": [
    { "tier": "hard", "accepted": 3, "requested": 5, "attempts": 3,
      "sampleReasons": ["answer not in options", "topic not in concept list"] }
  ]
}
```

## Step 6 — UI updates (`DiagnosticQuestionsSetup.tsx`)

- Wrap **Regenerate** in an `AlertDialog` confirming "This will replace all existing diagnostic questions." Generate (initial) does not need confirmation.
- On 422: show a destructive toast with the failing tiers and counts; do not call `markStepCompleted`. Refetch is unnecessary because nothing changed.
- On 200: success toast with `"Generated 20 questions (X/Y/Z attempts across tiers)"`; refetch and call `markStepCompleted("diagnostic", courseId)` only when `refreshed.length === 20`.
- Stats card: drop format breakdown (MCQ-only). Keep Total / Standard / Adaptive (Easy/Medium/Hard) counts.
- Remove any branches that special-cased `true_false` / `short_answer` rendering.

## Out of scope (deferred — not in this revision)

- Switching model to Gemini Pro.
- JWT verification / `verify_jwt = true` lockdown.
- Non-destructive regenerate (preserving teacher-edited rows).
- Reverting `markStepCompleted` if a teacher later deletes rows below threshold.

## Validation

- Call function via `supabase--curl_edge_functions` for the global-economics course.
- Verify breakdown shows 20/20 with at most 3 attempts per tier on a typical run.
- `supabase--read_query` on `diagnostic_questions` to confirm: every row `format='mcq'`, `jsonb_array_length(options)=4`, `answer = ANY(options)`, `concept_id IS NOT NULL`, `difficulty_estimate` within tier band.
- Force-fail test: temporarily tighten validator to reject all → expect 422 and unchanged row count.
