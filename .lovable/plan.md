Add an individual delete button to every mock-test card on the `/teacher/setup/exam-mode` page so teachers can remove any exam in the schedule, not just the last one.

Changes
1. Add a per-exam delete affordance in the exam card header (trash icon next to the source selector), matching the existing icon style used elsewhere on the page.
2. Add a confirmation flow (`confirmDeleteExamId` state + `requestDeleteExam`, `executeDeleteExam`) that reuses the existing `AlertDialog` pattern but targets a specific exam by ID.
3. On confirmation:
   - Remove the exam from `examSchedule`.
   - Delete generated questions (rows with `item_code` starting with `exam-`) from `assessment_questions` for that `exam_id`.
   - Unassign manual questions by setting `exam_id` to `null` for rows whose `exam_id` matches the deleted exam.
4. Update `examQuestionCounts` and `manualExamCounts` after deletion.
5. Keep the existing "remove last exam" plus/minus controls working unchanged.

Technical details
- File: `src/pages/teacher/ExamMode.tsx`
- New state: `const [confirmDeleteExamId, setConfirmDeleteExamId] = useState<string | null>(null);`
- New handlers:
  - `requestDeleteExam(id: string)` → opens confirmation if the exam is approved; otherwise deletes immediately.
  - `executeDeleteExam()` → performs the DB cleanup and state update, then closes the dialog.
- The `AlertDialog` copy will vary slightly: approved exams show a warning that the breakdown will be discarded; generated exams will mention that generated questions will be deleted; manual exams will mention that manual questions will be returned to the library.
- Existing `handleRemoveExamRequest` / `confirmRemoveExam` for the last-exam flow stay intact.

Verification
- After deleting a generated exam, its generated question count badge should disappear and the question rows should be removed from `assessment_questions`.
- After deleting a manual exam, its assigned manual questions should show as "Unassigned" in the custom-questions list.
- The remaining exams should keep their labels and order.