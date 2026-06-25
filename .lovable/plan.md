## Goal
Make the per-type breakdown (MCQ, True/False, etc.) freely editable for each Final, allow the total to exceed the time-based estimate, and stop length-slider changes from clobbering manual edits.

## Root cause of the current friction
- `handleLengthChange` recomputes `breakdown` from `questionEstimate(length, mix)` on every slider change, overwriting any manual MCQ/TF entries.
- The question-types effect (`useEffect` on `[examQuestionTypes]`) does the same when the global type mix changes.
- The "Edit Breakdown" gate means inputs only appear after an extra click, which compounds the perception that the numbers aren't editable.

## Changes (all in `src/pages/teacher/ExamMode.tsx`)

### 1. Track per-exam "breakdown dirty" flag
Add `breakdownDirty?: boolean` to `ExamScheduleItem`. Set it `true` whenever `handleBreakdownNumberChange` runs. Hydration from DB initializes it `false` (DB has no such field — purely local UI signal; if DB breakdown differs from the estimate for that length+mix, treat as already dirty so we don't overwrite a saved override).

### 2. Conditional recompute on length/type changes
- `handleLengthChange`: if `exam.breakdownDirty`, update `lengthMin` only; otherwise also recompute `breakdown` from the new estimate (current behavior).
- Question-types effect: same logic per exam — only refresh breakdown for exams where `breakdownDirty !== true`.

### 3. Always-on breakdown inputs (remove the Edit Breakdown gate)
Replace the read-only `<span>` + "Edit Breakdown" button with always-visible number `<Input>`s for each type (still debounced-persist per the existing `persistExamDebounced`). Keep `editingCardIds` removed from the render path; drop the now-unused `handleEditBreakdown` helper. This eliminates the click-to-edit friction entirely.

### 4. Soft warning when sum > estimated total
Compute `estimate = questionEstimate(exam.lengthMin, examQuestionTypes).total`. When `sum(breakdown) > estimate`, render an inline amber notice under the breakdown rows: `"Heads up: ${sum} questions in ${lengthMin} min is above the time-based estimate of ${estimate}. Students may run out of time."` Use existing `text-amber-600` / `Alert` styling — no new dependencies.

### 5. Reset-to-estimate affordance
Add a small ghost button next to the breakdown: "Reset to estimate" that clears `breakdownDirty` and recomputes from `questionEstimate(...)`. Lets the user undo a manual override.

## No schema or hook changes
- `useCourseExams.upsertExam` still persists `breakdown` as-is.
- No migration; `breakdownDirty` is local UI state only.

## Verification
- Playwright on `/teacher/setup/exam-mode`:
  1. Edit MCQ to 30, then move length slider → confirm MCQ stays at 30.
  2. Confirm sum (e.g. 35) > estimate (e.g. 20) shows the amber warning.
  3. Click "Reset to estimate" → breakdown snaps back to even distribution and warning clears.
  4. Reload page → manual edits persist (already covered by `persistExamDebounced`).
- Sanity: "+ Add new mock test" still works; new card starts with `breakdownDirty = false`.

## Out of scope
- Persisting `breakdownDirty` to the DB (local-only is enough since DB already stores the actual breakdown).
- Per-type max caps or validation.
- UI redesign of the rest of the card.