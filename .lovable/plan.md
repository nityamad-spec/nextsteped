## Add "View Questions" for Manual (Teacher) Exams

On `/professor/setup/exam-mode`, manual exam cards currently show only an "Add Question" and "Approve Exam" button. AI-generated exam cards already have a "View" button that opens `ExamQuestionsViewDialog`. Add the same capability for manual exams.

### Change

In `src/pages/teacher/ExamMode.tsx`, inside the manual branch (around lines 743–758, where the Add Question / Approve buttons live), add a "View Questions" button shown when `manualCount > 0`. Clicking it sets `viewExamId` to the exam's id, reusing the existing `ExamQuestionsViewDialog` already mounted at the bottom of the page.

### Technical details

- `ExamQuestionsViewDialog` queries `assessment_questions` filtered by `course_id` + `exam_id` only, so manual rows (which carry `exam_id` once assigned) render correctly with no dialog changes.
- Button styling matches the existing AI-side "View" button: `variant="outline" size="sm" className="h-7 text-xs"`.
- Disabled when `manualCount === 0`.
- No backend, schema, or other UI changes.