## Problems

In `src/pages/teacher/ExamMode.tsx`, the "Add Custom Question" dialog (lines ~948–1060):

1. **Dropdown only shows manual exams.** Line 967 maps `manualExams` (filtered at line 389: `labeledSchedule.filter(e => e.source === "manual")`). Exams whose source is `"generated"` (AI) never appear, so teachers cannot assign a custom question to them.
2. **No difficulty input.** `difficulty` is hardcoded to `"Medium"` at lines 538, 551, 560. The dialog has no control for it, even though `assessment_questions.difficulty` supports Easy / Medium / Hard and the type union already enumerates the three values (line 42).

## Fix

### 1. Show all exams in "Assign to Exam"
- Replace the `manualExams.map(...)` source with `labeledSchedule` (all exams).
- Render each item as `{label} — {AI-Generated | Manual}` so the source is still visible.
- Keep the "Unassigned (library only)" option at the top.
- Remove the "No manual exams yet" helper (lines 972–976) and replace with a neutral note when `labeledSchedule.length === 0` ("Add an exam above to assign this question.").
- Update the default in `openAddDialog` (line 504): preselect `preselectExamId ?? labeledSchedule[0]?.id ?? null` instead of `manualExams[0]`.

### 2. Add a Difficulty selector
- New state: `const [formDifficulty, setFormDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium")`.
- Reset it in `openAddDialog` (default `"Medium"`) and when editing, hydrate from the row (`q.difficulty ?? "Medium"`).
- Add a `<Select>` field in the dialog (placed right after "Assign to Exam"):
  - Label: "Difficulty"
  - Options: Easy / Medium / Hard
- Replace the three hardcoded `"Medium"` strings (lines 538, 551, 560) with `formDifficulty`.
- Ensure the local `Question` type already includes Easy/Medium/Hard (it does — line 42).

### 3. Surface difficulty in the view dialog (optional, low risk)
- `ExamQuestionsViewDialog` already receives `difficulty` per row; verify it renders it. If not, add a small badge. (Confirm during implementation; skip if already shown.)

## Risks to flag

1. **Mixing manual questions into AI-generated exams.** Today, generated exams are populated only by the `generate-exam-questions` edge function (rows with `item_code` starting `exam-`). After this fix, a teacher can hand-write a question and attach it to a generated exam. This is the user's stated goal, but:
   - The "questions per exam" count shown to teachers (lines 207–210, 226–229) only counts AI-generated rows (`item_code` startsWith `"exam-"`). Manually-added rows attached to a generated exam will be **delivered to students but not counted in the dashboard**. Recommend updating the counter to include manual rows assigned to that exam — flagging here, will include in implementation.
   - Re-running "Generate questions" for that exam may delete/replace AI rows. Need to verify the regeneration path does NOT also delete manual rows. Will inspect `generate-exam-questions` and the surrounding delete logic during implementation and adjust if needed.
2. **Exam length / time budget.** A manually added question doesn't change the configured `lengthMin` or estimated counts on the schedule. If a teacher adds many, the exam will run over the planned length. Out of scope to auto-adjust; surface only via the count (risk 1).
3. **Editing existing questions** created before this change have `difficulty = "Medium"` in the DB; hydration falls back to "Medium" so no migration is needed.
4. **No schema/DB changes.** `difficulty` and `exam_id` already exist on `assessment_questions`. No migration required.

## Out of scope

- Changing how AI generation counts questions or rebalances after manual additions (beyond the counter fix in risk 1).
- Adding difficulty to AI-generated questions' UI.
- Any backend/edge function rewrite.

## Verification

- Open Add Custom Question with a mix of AI-generated and manual exams configured: all exams appear in the dropdown with their source suffix.
- Add a question with Difficulty = Hard, reopen via Edit, confirm Hard is preselected and the DB row stores `"Hard"`.
- Assign a manual question to an AI-generated exam, open the exam's question list, confirm it appears alongside generated ones.
