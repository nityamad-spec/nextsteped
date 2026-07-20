## Goal

Change diagnostic mastery formula to `0.80 * accuracy + 0.20 * pace`, remove confidence from scoring and from the quiz UI, and recompute existing rows with the new formula.

## Changes

### 1. `supabase/functions/score-diagnostic/index.ts`
- Update `CONFIG.WEIGHTS` to `{ accuracy: 0.80, pace: 0.20 }`; remove `confidence`.
- Remove `CONFIDENCE_LEVELS`, `CONFIDENCE_DEFAULT`, and the per-answer confidence accumulation loop.
- `masteryScore = 0.80 * accuracyScore + 0.20 * paceScore`.
- Drop `confidence` from the returned `components`.
- Keep writing `confidences: []` to `diagnostic_results` (column stays; empty array) OR stop passing it — see DB note below.
- Update the header docstring (steps 3/4/5) to reflect the new formula.

### 2. `src/pages/student/DiagnosticQuiz.tsx`
- Remove `confidenceLabels`, the `confidence` state, `confidences` state, and the confidence selector UI block (~lines 665–690).
- Remove `confidence !== null` from `canProceed` (only `hasAnswer` gates Next).
- Stop reading/writing `confidence(s)` in save/restore autosave payloads.
- Stop sending `confidences` and per-answer `confidence` in the `score-diagnostic` invocation payload (send `confidences: []` for backward compat, or drop entirely if we relax the schema — see §4).

### 3. `src/lib/diagnosticsAnalytics.ts` + `src/components/admin/DiagnosticsAnalytics.tsx`
- Remove any confidence-derived metrics/columns shown in the admin analytics view (the `confidences` field is still selected today). This is presentational cleanup, not a schema change.

### 4. Request-schema compatibility
- `BodySchema` currently requires `confidences` + per-answer `confidence`. Loosen both to `.optional()` so the client can stop sending them without breaking older cached clients that still do.

### 5. Backfill existing `diagnostic_results` rows
- One-off migration to recompute `mastery_score` for every existing row using the new formula from the persisted `answers` + `question_times` + `question_ids`.
- Approach: a PL/pgSQL function that, per row, joins to `diagnostic_questions` on the stored `question_ids`, replays the same accuracy (difficulty × Bloom weight) and pace-curve math, writes the new `mastery_score`. `learner_level` is derived from branch tier + correct count and is unaffected, so it stays as-is.
- Runs once inside the migration; no schema changes to `diagnostic_results`.
- The `confidences` column is left in place (nullable) to preserve historical data — no drop.

## Dependencies / call-outs

- **learner_level is unchanged.** It's set by `levelFromBranch(branch, correct, answered)`, independent of `mastery_score`, so removing confidence does not shift any student's assigned level.
- **Score distribution shifts up** for students who previously rated themselves low-confidence (their 0.15 confidence term is redistributed 4:1 into accuracy/pace). Backfill will visibly change historical `mastery_score` values in admin analytics and any student-facing surface that reads it.
- **`diagnostic_results.confidences` column stays** to preserve history; only the UI capture and scoring use are removed. If you'd rather drop it entirely, say so and I'll add a schema migration.
- **No `update-mastery` impact.** `score-diagnostic` doesn't feed `student_concept_mastery` / `student_course_mastery`, so course mastery math is untouched.
- **Autosave payload shape changes.** In-flight quizzes with a cached `confidence` in localStorage will just ignore that field on resume — no crash, but worth mentioning.
- **Tests:** no existing tests cover `score-diagnostic` scoring math directly; `diagnosticBranching.test.ts` only covers branch/level logic and stays green.

## Out of scope

- Renaming or dropping the `confidences` column on `diagnostic_results`.
- Any change to weekly-quiz / exam / practice scoring.
- Any change to `learner_level` assignment.