# Gate confidence selector on having an answer

In `src/components/AssessmentView.tsx`, the per-question confidence buttons (Not confident / Somewhat / Very confident) currently render and are clickable regardless of whether the student has answered.

## Change

In `renderQuestionCard`, compute `hasAnswer` from `answers[q.id]`:
- For `short_answer` / `problem_solving`: `answers[q.id]?.trim().length > 0`
- For `mcq` / `true_false`: `!!answers[q.id]`

Then in the confidence block:
- Disable all three buttons when `!hasAnswer`.
- When `!hasAnswer`, also clear any previously-set confidence for that question (so flipping an answer back to empty wipes the stale confidence) — handled by gating `setConfidences` behind `hasAnswer`, and on answer-clear we remove the entry.
- Helper text changes: when no answer, show "Answer the question to rate your confidence." instead of "How confident are you in this answer?"

To keep state consistent if a student clears a text answer, update `handleAnswer` to delete `confidences[questionId]` when the new answer is empty.

## Out of scope
- Exam mode (uses the same component but request is weekly-quiz-specific; behavior change is harmless there and keeps a single code path).
- Any submit-button gating beyond the existing "must answer at least one" rule.
