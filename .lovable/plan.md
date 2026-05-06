# Plan: Add "Regenerate Lesson Plan" Button

## Context
`/teacher/setup/lesson-plan` (`src/pages/teacher/CourseCreation.tsx`) already has an **Update Plan** button, but it's gated by `scheduleChanged` (only enabled when total weeks / midterm / final week change). Once a plan exists, teachers have no way to ask for a fresh AI-generated plan unless they tweak the schedule.

## Change
Add a dedicated **Regenerate Plan** button that is always enabled while a plan exists, independent of schedule changes.

### Placement
Add next to the existing "Update Plan" button in the "Weekly Breakdown" header (line ~998–1009 of `CourseCreation.tsx`). Also mirror it in the Course Schedule card footer for consistency (line ~963–973).

### Behavior
- Visible only when `phase === "plan"` and `weeks.length > 0`.
- Enabled whenever `courseId` exists and not currently generating.
- Click → opens a confirmation dialog (reuse pattern of existing `showRegenerateConfirm`, but with separate state `showRegenFromScratchConfirm` so wording is distinct).
- Confirm → clears current weeks + draft, calls `runGeneration()` (same path as Update Plan).
- Dialog copy: "Regenerate lesson plan? This will discard the current weeks and any edits and produce a fresh AI-generated plan from your approved concepts. This cannot be undone."

### Visual
- `variant="outline"` to match neighboring controls
- Icon: `RefreshCw` from lucide-react
- Label: "Regenerate Plan"

## Out of Scope
- Backend changes (uses existing `generate-lesson-plan` edge function and `runGeneration()`).
- Changing the existing "Update Plan" semantics.
- Confirmation/undo persistence beyond the existing draft clear.

## Files to Edit
- `src/pages/teacher/CourseCreation.tsx` (only)
