## Add bulk-delete for approved roster

In `src/pages/teacher/EnrollmentSettings.tsx`, add a "Clear all" action to the approved roster section.

### UI
- Add a destructive outline button (Trash icon + "Clear all") in the roster list header, next to the count.
- Disabled when the roster is empty.
- Clicking opens an `AlertDialog` confirmation with the count of entries to be removed and a warning that already-enrolled students are unaffected (only the allowlist is cleared).

### Behavior
- On confirm: delete all rows from `course_roster_allowlist` scoped to the current `course_id`.
- Show toast on success/failure, then refresh the roster list.
- Existing enrollments are untouched; future sign-ups will be blocked until new emails are added.

### Out of scope
- No schema/RLS changes (existing teacher-scoped delete policy on `course_roster_allowlist` already permits this).
- No changes to CSV upload or manual add flows.
