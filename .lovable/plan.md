
# Plan: Simplify Course Mastery (Option A)

Single source of truth for course-level mastery is `update-mastery`, derived as a weight-averaged accuracy over `student_concept_mastery`. Diagnostic-only signals (pace, confidence) stay scoped to `diagnostic_results`. `profiles.learner_level` is no longer touched by any quiz/diagnostic flow.

---

## 1. Database migration

On `student_course_mastery`:
- Drop column `pace_component`
- Drop column `confidence_component`

(Keep `accuracy_component` — it equals `mastery_score` under this model and is harmless; can be revisited later.)

Backfill: recompute every existing `student_course_mastery` row from current `student_concept_mastery` using the same weighted-average formula `update-mastery` uses (sum(mastery_score * concepts.weight) / sum(concepts.weight) over rows where weight > 0), then update `mastery_score`, `learner_level`, `accuracy_component`, and `sample_count` (count of contributing concept rows). Done inline in the migration via a single UPDATE … FROM aggregate.

No changes to `profiles` schema.

## 2. Edge function changes

**`supabase/functions/score-diagnostic/index.ts`**
- Remove the `await admin.from("profiles").update({ learner_level }).eq("id", studentId)` call.
- Add a header comment: writes only `diagnostic_results`; course-level mastery is owned by `update-mastery`; pace/confidence are diagnostic-only signals.

**`supabase/functions/update-mastery/index.ts`**
- Remove `pace_component: null` and `confidence_component: null` from the `student_course_mastery` upsert payload (columns no longer exist).
- Add a server-side `console.warn` when `weightTotal === 0` (no contributing concepts).
- Add header comment: sole writer of `student_course_mastery`.

No other edge function writes `student_course_mastery` or `profiles.learner_level` from a quiz/diagnostic flow — will grep-verify before editing.

## 3. Frontend

No functional changes. Only required edits are removing any reads of the dropped columns if they exist (will grep `pace_component` / `confidence_component` across `src/` and remove dead references). Likely zero hits.

## 4. Risks & mitigations

- **Hidden second writer**: grep `student_course_mastery` and `profiles.*learner_level` across `supabase/functions/**` and `src/**` before editing; fail the plan loudly if anything else writes them.
- **Backfill correctness**: single SQL pass mirrors the edge-function formula exactly; concepts with `weight = 0` or NULL are excluded; students with no concept rows keep their existing row untouched (or get `mastery_score = 0, learner_level = beginner` — to confirm: current plan is to leave untouched).
- **`profiles.learner_level` becomes stale**: acceptable — it now represents the intake/legacy value and is not surfaced to students/professors per existing memory.
- **Race condition on concurrent submissions**: unchanged from today; out of scope.

## 5. Out of scope

- Renaming/removing `accuracy_component` or `profiles.learner_level`.
- Any UI changes to how mastery is displayed.
- Weekly-quiz edge function (will inherit this contract automatically when built).

## 6. Verification

- After migration: spot-check 3–5 `student_course_mastery` rows against a hand computation from their concept rows.
- After deploy: submit a test diagnostic; confirm `profiles.learner_level` does not change, `diagnostic_results` row is written, `student_course_mastery` is updated by `update-mastery` only.
