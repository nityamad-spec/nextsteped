## Remove the "last mock test" guard from the stepper

Currently the numeric "−" stepper on `/teacher/setup/exam-mode` is disabled when only one active mock test remains (`examSchedule.length <= 1`), and the `handleRemoveExamRequest` handler also bails out early in that case. The per-card archive icon already supports archiving the last active exam through a confirmation dialog, so the stepper is artificially inconsistent.

### Changes
1. In `src/pages/teacher/ExamMode.tsx`:
   - Remove the `disabled={examSchedule.length <= 1}` prop from the "−" stepper button.
   - Remove the `if (examSchedule.length <= 1) return;` guard inside `handleRemoveExamRequest` so the last row can be archived/removed like any other.

2. Preserve existing behavior:
   - If the last exam is approved or has generated questions, the existing confirmation dialog still fires before archiving.
   - If the last exam is unapproved and empty, it is still archived immediately.

### Risks / follow-up considerations
- After archiving the last active exam, the page will show zero active mock tests. This is already possible via the archive icon, so the UX is consistent.
- The "Add" button remains available to create a new mock test.
- No database schema changes required.

### Verification
- Build/compile check.
- Optional manual check: open `/teacher/setup/exam-mode`, click the "−" stepper with one active exam, and confirm it archives the last row and moves it to "Archived Mock Tests".