# Harden question-generation validators

Goal: eliminate answer/option/explanation/Bloom/difficulty/concept mismatches across every question-generating edge function by (a) centralizing validation in a shared module, (b) adding semantic checks that today only exist piecemeal, and (c) auditing per-batch quotas after generation.

## 1. New shared module

Create `supabase/functions/_shared/question-validation.ts` exposing:

- `normalizeAnswer(answer, options)` — deterministic recovery (verbatim → letter A–D → prefix-strip + unicode quote normalize → token-jaccard best match with a **minimum similarity threshold** and **unique-winner rule**; if two options tie, reject instead of guessing). Returns `{ ok: true, answer } | { ok: false, reason }`. Replaces the fuzzy `startsWith` recovery in `generate-practice-questions` lines 557–597.
- `validateStructural(q, { allowedFormats })` — 4-option MCQ, no dupes, non-empty; length-parity anti-cue; T/F stems reject "Which/Choose/of the following" shape (port of practice lines 539–550); reject `A) …` prefixes still embedded in options.
- `validateConcept(q, conceptByCode)` — exact code → case-insensitive → fuzzy against `humanizeConceptCode` synonym set; reject if not found.
- `validateBloom(q, { allowedRange, tierHint })` — integer in range, no silent coercion (fix `generate-exam-questions` line 193 and practice `clampBloom` behaviour). Optional check that Bloom is consistent with declared difficulty (e.g. `difficulty >= 0.7` implies bloom ≥ 3).
- `validateDifficulty(q, { spec })` — numeric, in `[0,1]`, and within `spec.difficulty ± spec.band` when a spec is passed; reject on mismatch instead of clamping.
- `validateExplanation(q)` — port + generalize `explanationSupportsAnswer` from `generate-weekly-quiz` lines 228–262:
  - non-empty and > 20 chars
  - for T/F: contradiction detector already in weekly quiz
  - for MCQ: require ≥ N answer-token overlap AND reject when a distractor's token overlap exceeds the answer's
  - additional: reject if explanation literally says "Option B" / a letter that isn't the answer's index
- `validateBloomJustificationPair(q)` — port the CATEGORY-regex + `BLOOM_CATEGORY_BY_LEVEL` cross-check from `generate-diagnostic-questions` lines 365–388 so exam/quiz/practice get it too.
- `auditBatchQuotas(accepted, batchSpec)` — verify per-concept counts and easy/medium/hard mix produced by `generate-exam-questions` (batch built at lines 71–135 but never audited); return a list of shortfalls to feed into a retry prompt.
- `dedupWithin(accepted, incoming)` — lift `isNearDuplicate` / `isSameFactAsStandard` from `generate-weekly-quiz` lines 190–216 and apply in diagnostic and exam generators too.
- Add the entire plan as a commented section in this file for future reference

All helpers return the same `{ ok: true, q } | { ok: false, reason }` shape so callers keep a single retry-hint pipeline.

## 2. Per-function integration

- `**generate-diagnostic-questions/index.ts` (validateMcq, 293–405)** — replace inline structural/topic/bloom-justification code with shared helpers; add `validateExplanation` and `dedupWithin` (currently missing).
- `**generate-exam-questions/index.ts` (validateQuestion, 138–206)** — swap in shared module; stop coercing Bloom silently (line 193); add difficulty-band check driven by batch bucket (easy≈0.2/med≈0.5/hard≈0.85 ±0.15); call `auditBatchQuotas` after the batch loop and trigger a top-up retry when a concept or bucket is short.
- `**generate-weekly-quiz/index.ts` (309–388)** — keep as-is but re-export `explanationSupportsAnswer` / dedup helpers from the shared module rather than duplicating.
- `**generate-practice-questions/index.ts` (532–628)** —
  - Replace silent `clampBloom` / `clamp01` (lines 624–625) with real validation → drop the question when out of range instead of coercing.
  - Enforce topic ∈ `allowedCodes` (validator currently trusts the prompt).
  - Replace fuzzy answer recovery (557–597) with the shared `normalizeAnswer`, which refuses ambiguous matches.
  - Require `explanation.trim().length > 0` and run `validateExplanation`.
- `**generate-question-metadata/index.ts` (116–150)** — after clamping, cross-check classifier output against the given question via `validateExplanation` and the difficulty↔bloom consistency rule; if inconsistent, retry once with a stricter prompt before returning defaults (2 / 0.5).
- `**seed-questions/index.ts` (9–128)** — align T/F answer convention with the generators. Store answers as `"True"`/`"False"` (not `"A"`/`"B"`) so downstream code has one shape. Add a call to `validateStructural` before insert so bad seed rows fail loudly.

## 3. Retry-hint plumbing

Every validator failure returns a `reason`. Extend the existing retry loops (already present in diagnostic and weekly quiz) so the next model call receives a compact retry hint like `Previously rejected: 3 items — 2 "answer not in options", 1 "explanation supports distractor"`. This exists in weekly quiz (`retryHint` at line ~404 of generate-weekly-quiz) but not in exam or practice; add it there.

## 4. Tests

Add `_shared/question-validation_test.ts` (Deno tests) covering:

- MCQ with duplicate options / with letter-only answer / with unicode-quoted answer.
- T/F stem shaped like an MCQ.
- Explanation that name-drops the wrong option letter.
- Explanation whose token overlap with a distractor exceeds the answer's.
- Bloom = 5 on an MCQ (should reject, not coerce).
- Difficulty out of tier band.
- Concept code with wrong case + concept code that doesn't exist.
- Batch audit: 4 concepts requested, model returns 5 of one and 0 of another → shortfall for the missing one, surplus trimmed.

## Non-goals

- No change to model choice, prompts, or DB schema.
- No change to the diagnostic branching or mastery math.
- No client-side changes.

## Files touched

- **New:** `supabase/functions/_shared/question-validation.ts`, `supabase/functions/_shared/question-validation_test.ts`
- **Edited:** `supabase/functions/generate-diagnostic-questions/index.ts`, `generate-exam-questions/index.ts`, `generate-weekly-quiz/index.ts`, `generate-practice-questions/index.ts`, `generate-question-metadata/index.ts`, `seed-questions/index.ts`