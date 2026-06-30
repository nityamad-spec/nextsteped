## Update Exams stat in Course Profile dialog

In `src/components/admin/CourseProfileDialog.tsx`, replace the "Students attempted" and "Total attempts" rows in the Exams card with two clickable rows mirroring the weekly quizzes pattern.

### Logic
- Determine active exams: existing `courseExams` list (non-archived) for the course.
- For each enrolled student (after university filter), count distinct active exams they have submitted in `assessment_results` (mode = exam/final/midterm as already mapped).
- `examCompletedAll`: students whose submitted-exam count equals total active exams (and total active exams > 0).
- `examNotCompleted`: all other enrolled students (including zero attempts).

### UI
- Row 1: "Completed all N exams: X" (clickable → student list)
- Row 2: "Not completed: Y" (clickable → student list)
- If there are zero active exams, show a muted "No active exams" line and skip clickable rows.
- Keep the existing "Avg score" line as-is.

### Sub-dialog
Extend the existing roster sub-dialog mode union with `exam-completed` and `exam-not-completed`. Reuse the same name+email list rendering; sort alphabetically; respect the active university filter.

### Out of scope
No backend / schema changes. No changes to quiz section or other tiles.