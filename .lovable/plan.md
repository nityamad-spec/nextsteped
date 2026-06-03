# Plan

In `src/pages/teacher/EnrollmentSettings.tsx`:

1. **Remove the "Sections" dropdown** from the Publish Settings card. Change the grid from `sm:grid-cols-3` to `sm:grid-cols-2` so Start Date and End Date fill the row.
2. **Remove the "Weekly Nudges" row** (label + Switch) from the Student Enrollment card.
3. **Clean up unused code**: remove `publishSection` state, the `Switch` import, the `Select*` imports, and the `weeklyNudges` state.

No backend, routing, or other UI changes.