# Limit weekly quizzes to one attempt

Students currently see a "Take Quiz" button for every week regardless of whether they've already submitted. After this change, once an `assessment_results` row exists for `(student_id, course_id, mode='daily_quiz', quiz_day=N)`, the button is replaced with a disabled state showing their score.

## Changes — `src/pages/student/StudentHome.tsx`

1. **Load taken quizzes** in a new effect alongside the existing mastery load:
   ```ts
   const [takenQuizzes, setTakenQuizzes] = useState<Record<number, { score: number }>>({});
   ```
   Query `assessment_results` for `student_id = user.id`, `course_id = enrolledCourseId`, `mode = 'daily_quiz'`, selecting `quiz_day, score`. Build `{ [quiz_day]: { score } }`. Re-run when the quiz dialog closes (same dep as existing mastery effect) so a freshly-submitted quiz immediately flips the button.

2. **Render**: at the Weekly Quiz block (around line 431), branch on `takenQuizzes[dp.day]`:
   - If present: show a muted "Completed — {score}%" badge and a disabled Button reading "Quiz completed".
   - Else: existing "Take Quiz" button.

3. **Guard the launcher**: in `setQuizDialog({ open: true, day: dp.day })`, also short-circuit if `takenQuizzes[dp.day]` exists (defensive — button is already disabled).

## Out of scope
- Backend uniqueness constraint (purely UI gate — a determined student could still POST, but the existing flow has no other entry point).
- Allowing retakes / teacher reset.
- Exam mode (single-attempt rule was specified for weekly quizzes only).
