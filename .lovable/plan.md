# Weekly Quiz: Confidence + Per-Question Time

The `assessment_results` table already has `confidences` and `question_times` (jsonb) columns from the recent migration aligning it with `diagnostic_results`. No schema changes needed — purely frontend wiring.

## Changes

### 1. `src/components/AssessmentView.tsx`
- Add state:
  - `confidences: Record<string, "not_confident" | "somewhat_confident" | "very_confident">`
  - `questionTimes: Record<string, number>` (seconds spent on each question)
  - `questionStartRef` (ref tracking when current question was shown)
- In `renderQuestionCard`, below the answer input, render a "How confident are you?" selector with three buttons (Not confident / Somewhat / Very). Selecting one updates `confidences[q.id]`.
- Track time per question: when `currentIndex` changes (or question first shown), record start timestamp. When user moves to next/prev, finishes, or submits, accumulate elapsed seconds into `questionTimes[currentQuestion.id]`.
- Extend `AssessmentResults` interface with:
  - `confidences: Record<string, string>`
  - `questionTimes: Record<string, number>`
- Include both in the object passed to `onSubmit` in `handleFinish`.
- Quiz Submit button stays enabled even if confidence not picked (optional), but show a subtle hint. (Default behavior: optional, stored as null/omitted for unanswered.)

### 2. `src/components/WeeklyQuizDialog.tsx`
- In `handleSubmit`, include `confidences: results.confidences` and `question_times: results.questionTimes` in the `assessment_results` insert payload (cast via `Json`).

### 3. Test
- Update `src/components/WeeklyQuizDialog.test.tsx` expectations only if the new fields cause failure (the current `toMatchObject` won't fail since it allows extras — no change needed).

## Storage shape
- `confidences`: `{ "<question_id>": "not_confident" | "somewhat_confident" | "very_confident" }`
- `question_times`: `{ "<question_id>": <seconds:number> }`

Matches how diagnostic flow stores them.

## Out of scope
- Exam mode (only weekly quiz per request, but since AssessmentView is shared, exam will also collect them; ExamMode's submit handler is unchanged so they just won't be persisted there).
- Any analytics/dashboard surfacing of the new data.
