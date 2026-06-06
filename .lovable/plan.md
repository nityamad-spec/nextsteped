# Adaptive 10-question weekly quizzes — generation + delivery

Today, the "Weekly Quiz" tile on `/teacher/setup/lesson-plan` is a resource marker only — no questions are written to `assessment_questions`, so the student dialog falls back to the static local bank. This plan makes weekly quizzes a real adaptive assessment by (a) generating a tiered question bank when the plan is saved, and (b) running a two-phase quiz at student time, mirroring the diagnostic.

The `assessment_questions.tier` column (`standard | easy | medium | hard`) and the `assessment_results.branch_tier / learner_level / mastery_score` columns already exist from the earlier additive migration. No schema work is needed.

## 1. New edge function — `generate-weekly-quiz`

Mirrors `generate-diagnostic-questions`. Input: `{ courseId, quizDay, weekTopic, weekConcepts: [{ concept_code, concept_name }], regenerate?: boolean }`.

For the given week, calls Lovable AI (Gemini 2.5 flash) to produce **20** MCQ questions with explanations, distributed exactly as:
- 5 `standard` (medium-baseline, same for all students)
- 5 `easy`
- 5 `medium`
- 5 `hard`

Each question is scoped to a concept from `weekConcepts` (so the `topic == concept_code` trigger passes) and persisted into `assessment_questions` with `mode='daily_quiz'`, `quiz_day=quizDay`, `tier=<...>`, plus the standard fields. If `regenerate=true` or a tier is incomplete, prior rows for that `(course_id, quiz_day, tier)` are deleted first; otherwise existing complete tiers are skipped (idempotent).

## 2. Lesson-plan integration — `src/pages/teacher/TeachingPlan.tsx`

- Detect "Weekly Quiz" resource per day (already typed as `quiz`).
- Add a small "Generate questions" button on each week that has a quiz resource, plus a "Regenerate" option. Button shows a question-count badge (e.g. `0/20`, `20/20`) so the teacher sees status.
- On `savePlan()` / publish, fire `generate-weekly-quiz` for every quiz-bearing week whose count is `<20`. Errors per-week are toasted but don't block the save.
- Pull `concepts` for the week by joining `lesson_plan_weeks.concept_ids` (already stored) → `concepts` table.

## 3. Two-phase student runner — `src/components/WeeklyQuizDialog.tsx`

Replace the current single-pass loader with a two-phase flow that mirrors the diagnostic:

1. **Phase A:** load all `tier='standard'` rows for `(course_id, mode='daily_quiz', quiz_day=N)`, seeded-shuffle by `studentId+courseId+day`, take 5. Show via existing `<AssessmentView type="quiz">`.
2. Intercept `onSubmit` of Phase A (don't persist yet). Count correct out of 5:
   - `0–1 → easy`, `2–3 → medium`, `4–5 → hard`.
3. **Phase B:** load 5 rows from the chosen `tier`. Re-mount `<AssessmentView>` with all 10 questions concatenated, starting in `phase="active"` at index 5 (requires two new optional props on `AssessmentView`: `initialIndex?: number`, `initialPhase?: "intro" | "active"` — defaults preserve current behavior).
4. On the final submit, persist a single `assessment_results` row with:
   - existing fields (`score`, `total_questions=10`, `correct_answers`, `answers`, `time_spent`, `confidences`, `question_times`)
   - `branch_tier: <chosen>`, `mastery_score: score`, `learner_level` derived as `≥0.85 expert / ≥0.6 proficient / ≥0.35 developing / else beginner`.

### Shared logic — `src/lib/weeklyQuizBranching.ts` (new)

```ts
export const WQ_STANDARD_COUNT = 5;
export const WQ_ADAPTIVE_COUNT = 5;
export type WqTier = "easy" | "medium" | "hard";
export function pickWeeklyBranchTier(c: number): WqTier {
  if (c <= 1) return "easy";
  if (c <= 3) return "medium";
  return "hard";
}
```
Plus a tiny unit test mirroring `diagnosticBranching.test.ts`.

### Edge cases

- A tier has `<5` questions: take whatever exists; if `0`, fall back to medium → easy → hard for Phase B. Final score uses actual question count, not always 10.
- No `standard` questions at all: show a friendly "Quiz isn't ready yet — please contact your professor" message.
- The existing one-attempt lock on `StudentHome` is unchanged.

## 4. Test updates

- `src/components/WeeklyQuizDialog.test.tsx`: extend the `assessment_questions` mock to return 5 standard + 5 easy/medium/hard so the two-phase render works; assert that the inserted row carries `branch_tier` and `total_questions=10`.
- Add `src/lib/weeklyQuizBranching.test.ts` with boundary tests for the threshold function.

## Out of scope
- Teacher form changes on `/teacher/assessments` (manual-add stays as-is; teacher can still add extras, but generation is now the primary source).
- Surfacing `branch_tier` / `learner_level` in any student view (mastery stays hidden per project rules).
- Exam mode (unchanged).
