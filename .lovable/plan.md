## Add Edit capability to the View Questions dialog (Mock Test section)

Route: `/teacher/setup/exam-mode` → Mock Test card → "View Questions"

### Goal
Let teachers edit an existing exam question directly from the View Questions dialog, using the same full-featured Add/Edit dialog already available in `ExamMode.tsx` (with all metadata fields and the "Regenerate all" auto-generate button).

### Changes

1. **`src/components/ExamQuestionsViewDialog.tsx`**
   - Add an "Edit" (Pencil icon) button on each question card.
   - Accept two new optional props from the parent:
     - `onEditQuestion(question)` — opens the parent's existing edit dialog with that question preloaded.
     - `refreshKey` / re-fetch trigger — so after a save in the parent dialog, the list refreshes.
   - After edit, refetch `assessment_questions` for this exam so updates appear immediately.
   - Keep the dialog scrollable and visually unchanged otherwise.

2. **`src/pages/teacher/ExamMode.tsx`**
   - When rendering `<ExamQuestionsViewDialog />`, pass `onEditQuestion` that:
     - Closes/keeps open the View dialog (keep View open; overlay Edit on top).
     - Loads the selected question into the existing Add/Edit Question dialog state (same one used by "Add Question"), pre-filling every field: question text, type, options, correct answer, topic, difficulty, bloom level, difficulty estimate, explanation, bloom justification, difficulty justification.
     - On save, `UPDATE assessment_questions` by `id` (already supported by the existing save handler) and trigger a refetch in the View dialog.
   - The existing "Regenerate all" flow works automatically since it's part of that dialog.

3. **No changes** to DB schema, RLS, edge functions, or the auto-generate edge function.

### Editable fields (all already in the current Edit dialog)
Question text, question type, options, correct answer, topic, difficulty, bloom level, difficulty estimate, explanation, bloom justification, difficulty justification.

### Verification
- Open View Questions on a Manual (Teacher) final → click Edit on a question → confirm all fields prefill.
- Edit text + change bloom level → Save → confirm updated values render in the list.
- Click "Regenerate all" inside the edit dialog → confirm metadata fields update.
- Typecheck passes.
