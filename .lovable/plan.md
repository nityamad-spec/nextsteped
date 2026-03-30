

## Plan: Move Enable/Disable Toggles to Assessments Page

### Problem
The exam/quiz enable toggles live on `/teacher/exam-mode` (the setup wizard step), which is not where teachers go post-setup. The Assessments page (`/teacher/assessments`) is the natural home since it already has exam and quiz settings tabs with time limits, question counts, and question management.

### Approach
Add auto-saving enable/disable switches directly into the existing Exam Settings and Daily Quiz Settings cards on the Assessments page. Remove the toggle from ExamMode (keep it as setup-wizard-only for approval). The toggle on Assessments will save immediately on change — no "Save" button needed for the switch.

### Changes

**1. `src/pages/teacher/Assessments.tsx`**
- Add an "Available to Students" Switch with auto-save inside the Exam Settings card (after the existing settings, before the Save button)
- Add a matching "Available to Students" Switch inside the Daily Quiz Settings card
- Each switch calls `saveTASettings` immediately on toggle, with a toast confirmation
- Show a clear visual indicator (green border / muted border) based on enabled state
- Gate the toggle on the corresponding `approved` flag — if not approved yet, show a disabled switch with helper text "Approve exam rules in setup first"

**2. `src/pages/teacher/ExamMode.tsx`**
- Keep the approval flow unchanged (setup wizard still controls approval)
- Remove the standalone "Available to Students" toggle — it now lives on Assessments
- On first approval, still auto-set `examEnabled`/`quizEnabled` to `true` and save

### No database or type changes needed
The `exam_enabled` and `quiz_enabled` columns and types already exist.

### Files Modified
- `src/pages/teacher/Assessments.tsx` — add enable/disable switches with auto-save
- `src/pages/teacher/ExamMode.tsx` — remove post-approval toggle UI

