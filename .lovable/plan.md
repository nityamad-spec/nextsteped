
## Goal

Close four quality/integrity gaps in the `/teacher/setup/diagnostic` flow:

1. No orphan rows (concept_id always non-null and matches a real concept).
2. Difficulty drift enforced server-side, not just by prompt.
3. `diagnostic` step status reflects actual data, not just "≥1 row exists".
4. Use a higher-quality model for question generation.

Scope:
- `supabase/functions/generate-diagnostic-questions/index.ts`
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx`
- `src/pages/teacher/CourseSetup.tsx` (status derivation only)

No DB schema changes.

---

## Step 1 — Kill hallucinated topics (concept_id NEVER null)

The current `validateMcq` already requires `topic in conceptByCode`, but harden it and the insert path:

- In `validateMcq`: keep the `topic` membership check; additionally **trim + case-insensitive normalize** the topic against `conceptByCode` keys (some Gemini outputs lowercase / re-case the code). Resolve to the canonical code before returning `normalized.topic`.
- In the persistence loop: assert `conceptByCode[q.topic]` is a non-empty string before pushing the row; if missing, skip the row and log (defense-in-depth — should be unreachable after validation).
- After `insert`, run a sanity SELECT `count(*)` filtered by `course_id AND concept_id IS NULL`; if > 0, return 500 with a clear message (will not happen but catches future regressions).

Result: `diagnostic_questions.concept_id` is always populated and references a row in `concepts`.

## Step 2 — Enforce difficulty band server-side

Already partially in place (`spec.difficulty ± 0.2`). Tighten and expose:

- Reduce the validator band to **±0.15** to match the prompt contract.
- Add a second hard clamp: reject if `bloom_level` is wildly inconsistent with tier (easy tier → bloom ≤ 4; hard tier → bloom ≥ 3). This is a sanity guard, not an exact gate.
- Add a final pre-insert sweep: filter `accepted` once more through `validateMcq` (idempotent) so any future code path that bypasses the loop still gets the band check.
- Include `rejectedForDifficulty` count in `breakdown[].sampleReasons` so the UI can surface it.

## Step 3 — Step completion gating

Today: `markStepCompleted("diagnostic")` fires whenever `refreshed.length > 0`, AND `CourseSetup.tsx` re-derives `Complete` from the same loose check (line 171). A teacher who deletes rows still shows Complete because of the `AUTO_COMPLETE_STEPS` backfill (line 209-214).

Fix in three places:

1. **Edge function**: only the all-or-nothing 200 path is reachable when 20 valid rows are inserted (already enforced by Step 4 of the prior plan). No change.
2. **`DiagnosticQuestionsSetup.tsx` `handleGenerate`**: call `markStepCompleted` only when `refreshed.length === 20` AND every tier has the expected count (group by `difficulty_estimate` band). Keep existing 422 short-circuit.
3. **`CourseSetup.tsx` status derivation**:
   - Replace the `select("id").limit(1)` probe with a `select("id", { count: "exact", head: true })` to get the true row count.
   - `next.diagnostic = count >= 20 ? "Complete" : count > 0 ? "In Progress" : opened.diagnostic ? "In Progress" : "Not Started"`.
   - In the `AUTO_COMPLETE_STEPS` backfill block, also actively **clear** `completed_at` when the derived status drops below Complete. Add a small helper `clearStepCompleted(uid, "diagnostic", courseId)` in `src/lib/setupProgress.ts` that upserts `completed_at: null` (mirrors `markStepCompleted` shape, with audit log entry `action: "mark_completed", success: true, payload.cleared: true`).
   - Gate the backfill: only call `markStepCompleted("diagnostic", ...)` when `count >= 20`.

This way, deleting questions in Assessments later flips the badge back to In Progress on the next dashboard load, and the persisted `completed_at` is reset.

## Step 4 — Switch model to Gemini 2.5 Pro

In `generate-diagnostic-questions/index.ts`:

- Change `MODEL = "google/gemini-2.5-flash"` → `"google/gemini-2.5-pro"`.
- Lower per-attempt `temperature` from `0.4` to `0.3` (Pro tends to need less randomness for variety).
- Keep `MAX_ATTEMPTS = 3`. Pro is slower; expect ~60–90s wall time for 4 parallel tiers.
- Update `ESTIMATED_SECONDS` in `DiagnosticQuestionsSetup.tsx` from `45` to `75` so the progress bar pacing matches reality.
- Add a small note in the UI footer: "Using high-quality model — generation may take ~60–90s."

No prompt change beyond what already restricts to MCQ.

## Step 5 — Validation

- Call `supabase--curl_edge_functions` POST `/generate-diagnostic-questions` with `{ courseId }` for the global-economics course.
  - Expect 200 with `breakdown` showing 5/5 per tier and ≤3 attempts.
  - `supabase--read_query`: assert
    - `count(*) = 20`
    - `count(*) FILTER (WHERE concept_id IS NULL) = 0`
    - per-tier difficulty within ±0.15 (e.g., easy rows have `difficulty_estimate BETWEEN 0.05 AND 0.35`).
- Manually delete 2 rows via `supabase--insert` (`DELETE ... WHERE id IN (...)`), reload `/teacher/setup`, confirm the Diagnostic card flips from Complete → In Progress and `teacher_setup_progress.completed_at` is cleared.
- Force-fail by tightening validator locally to confirm 422 still leaves rows untouched.

## Out of scope (deferred)

- Non-destructive regenerate (preserve teacher edits).
- JWT verification on the function.
- Background job / webhook so the UI doesn't hold an HTTP connection for ~75s.
