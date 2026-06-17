## Goal
On `/teacher/setup/exam-mode`:
1. Let the teacher mark each mock exam as either **AI-generated** or **Manual** (teacher writes the questions).
2. Make custom questions actually appear in the student's exam by tagging them with a specific `exam_id` (manual exams). Today they save with `exam_id = null` so the student-side query (which filters `exam_id IS NOT NULL`) never sees them — so the concept dropdown is wired up, but the resulting questions go nowhere.

## Changes

### `src/types/index.ts`
- Extend `ExamScheduleItem` with `source?: "generated" | "manual"` (default `"generated"` when missing).

### `src/pages/teacher/ExamMode.tsx`

**Per-exam source selector**
- In each exam card (the `labeledSchedule.map(...)` block, ~lines 564–681), add a small `Select` next to the "Final" badge:
  - Options: `Generated` (AI builds questions) / `Manual` (you write all questions).
  - Persists via `updateExam(exam.id, { source, approved: false })`.
- For `source === "manual"`:
  - Hide the question-mix breakdown editor, the difficulty estimate, the **Generate Questions** button, and the generated-count badge.
  - Replace them with: a count of manual questions already assigned to this exam (derived from a new `manualExamCounts` map computed from `questions.filter(q => q.exam_id === exam.id)`), an **Add Question** shortcut that opens the existing dialog pre-set to this exam, and helper text "Add at least 1 question to approve".
  - Approval rule: `Approve Estimate` becomes `Approve Exam` and is enabled only when `manualExamCounts[id] >= 1`. `canContinue`/`allExamsApproved` logic unchanged otherwise.
- For `source === "generated"`: behaviour is unchanged.

**Custom Question dialog (~lines 793–869)**
- Add a required **Assign to Exam** `Select` above the existing Concept field, listing all `source === "manual"` exams (using `labeledSchedule` for the `Final N` label) plus an "Unassigned (library only)" option.
- Track via new state `formExamId: string | null`. When opened from a manual-exam card's Add button, pre-fill with that exam's id.
- `handleSaveQuestion`: include `exam_id: formExamId` in the inserted/updated row (instead of always null). Disable the Save button until `formExamId` is chosen if any manual exams exist.

**Custom Exam Questions list (~lines 703–778)**
- Add a small chip per row showing which exam it's assigned to (e.g. `Final 2`) or `Unassigned`.
- Update the local `EditableQuestion` interface and the `fetchQuestions` mapping to keep `exam_id` on each row (don't filter manual rows out of `questions` — they still need to be editable; only generated rows, which already have `exam_id` AND were created via the generate flow, are excluded). To distinguish, generated rows have `item_code` starting with `exam-`; keep the existing exclusion by `item_code` prefix instead of by `exam_id IS NULL`. Simpler: select rows where `item_code IS NULL OR NOT item_code LIKE 'exam-%'`.

**State / persistence**
- `handleSave` already writes `examSchedule` to `course_ta_settings`; the new `source` field rides along inside each item — no migration needed (column is JSONB).
- `buildInitialSchedule` defaults `source: "generated"` for legacy items.

### Student side — no change required
`src/pages/student/AIChat.tsx` already loads all `mode = exam` rows with non-null `exam_id` (lines 444–479), so manually-authored questions tagged with an `exam_id` automatically join that exam's rotation alongside any AI-generated ones.

## Out of scope
- No DB schema changes (the JSONB `exam_schedule` column already stores arbitrary fields; `assessment_questions.exam_id` already exists).
- No edge-function changes.
- Mixed exams (manual + generated in the same exam) are still allowed implicitly — a `generated` exam can also carry manual questions later — but the UI only encourages one mode per exam.

## Verification
1. Add a 2nd mock exam, set it to **Manual**, click Add Question, pick a concept and write an MCQ, save → row appears in the list with a `Final 2` chip.
2. Approve the manual exam, save the page → student-side Exam tab now shows that question when rotating to `Final 2`.
3. Existing generated exams keep working unchanged (Generate button still produces and stores `exam_id`-tagged rows).
