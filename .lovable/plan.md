
## Goal

Refactor Step 4 in `supabase/functions/generate-practice-questions/index.ts` (lines 566–642) so every check goes through helpers in `supabase/functions/_shared/question-validation.ts`. No new shared code — just use what's already there. Scope is limited to this one edge function; no DB/schema/prompt-template changes.

## Shared helpers to adopt

| Helper (shared module) | Currently used? | Change |
|---|---|---|
| `validateStructural` | yes | keep |
| `validateConcept` | yes | keep |
| `normalizeAnswer` | yes (MCQ) | also use for T/F normalisation via `normalizeAnswer(raw, ["True","False"])` — removes the loose `/^t/i` matcher |
| `validateOptionParity` | yes | keep |
| `validateDifficulty` | partial (no band) | pass `midpoint` + `band` derived from `intent.difficulty` |
| `validateBloom` | yes | keep (also enforce MCQ ≤ 5 / T/F ≤ 4 via a thin wrapper around returned value) |
| `validateExplanation` | yes | keep |
| `dedupWithin` | **no** | add — dedupe candidates against each other AND recent stems |
| `auditBatchQuotas` | **no** | add — per-concept audit; log/return shortfall |
| `summarizeRejections` | **no** | add — feed hint back to the model on the retry pass, plus log summary |

## Steps

1. **Difficulty band from intent.** Build `diffBand(intent.difficulty)` returning `{ midpoint, band }` for `easy/medium/hard`, `undefined` for `mixed`. Pass to `validateDifficulty` so out-of-band values are rejected instead of silently accepted.
2. **Intent-side filters (before shared checks).** Reject items whose `format` is not in `intent.types`; when `intent.bloom_focus` is non-empty, reject items whose bloom is outside that set (± 1 tolerance).
3. **Format cap on bloom.** After `validateBloom`, reject MCQ with bloom > 5 and T/F with bloom > 4.
4. **T/F answer via `normalizeAnswer`.** Replace the current first-letter regex with `normalizeAnswer(q.answer, ["True","False"])` for T/F — same rejection path as MCQ.
5. **Recent stems fetch.** Extend the parallel fetch (lines 460–466) to also select the last ~30 stems of `mode='practice'` from `assessment_results` (falling back to empty list when practice isn't persisted). Feed them into `recent_stems_json` (currently hard-coded `"[]"` on line 538) so the prompt sees them.
6. **Cross-item + recent-stem dedup.** After the per-item loop, call `dedupWithin(candidates, recentStems)` and drop rejected duplicates; push their reasons into `rejections`.
7. **Aggregated rejection log.** Replace the "first 8 raw strings" log with a `Map<reason, count>` summary; call `summarizeRejections` to build a compact string for logging (and for the retry hint in step 8).
8. **Bounded retry loop.** If `accepted.length < intent.count`, run at most 2 additional generations for the shortfall. Each retry:
   - Appends `summarizeRejections(rejections)` and the accepted stems ("do not repeat these") to the system prompt.
   - Runs items through the exact same validation pipeline.
   - Guarded by a 60 s wall-clock budget across all retries so student latency stays bounded.
9. **Quota audit.** After retries, run `auditBatchQuotas(accepted, { perConcept: spec })` where `spec` is a roughly-even split across `allowedCodes` (or weighted by `exam_weight` when `intent.goal === "exam_prep"`). Attach the shortfall to the response as `warnings` (non-fatal) and log it.
10. **Response shape.** Return `{ questions, warnings? }`. Keep 502 only when `accepted.length === 0` after retries.

## Technical notes

- All new imports come from the existing `../_shared/question-validation.ts`:
  ```ts
  import {
    dedupWithin,
    auditBatchQuotas,
    summarizeRejections,
  } from "../_shared/question-validation.ts";
  ```
- No prompt-template rewrite; only `recent_stems_json` gets real data and the retry pass appends a hint string.
- No changes to `_shared/question-validation.ts`.
- No DB migrations. Recent-stems query is read-only against existing `assessment_results`.
- Client (`PracticeQuestionsWidget.tsx`) already reads `questions`; adding an optional `warnings` field is backward-compatible.

## Out of scope

- Streaming / heartbeats (practice runs are short, single-call).
- Model swap.
- Persisting practice questions.
- Changes to any other generator (exam / weekly / diagnostic).
