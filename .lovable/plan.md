## Change

Replace the single-select University dropdown on `/admin/courses` with a multi-select checkbox popover so admins can filter by any combination of universities. Exports respect the multi-selection.

### Frontend — `src/pages/admin/AdminCourses.tsx`
- Replace `selectedUniversityId: string` with `selectedUniversityIds: string[]` (empty array = "All universities").
- Replace the `Select` with a Popover trigger (`Button` styled like the current trigger) showing:
  - Chip summary: "All universities" / "{name}" / "{n} universities".
  - Popover content with a scrollable list of `Checkbox` rows (one per university), plus "Select all" and "Clear" actions.
- Update `visibleCourses` to include a course when any selected university id is present in `courseUniversities[c.id]` (or show all when the selection is empty).
- Update the helper text to reflect multiple universities.
- Update the empty-state copy for the multi-select case.

### Export scoping — `src/lib/exportCourseToExcel.ts`
- Extend the `opts` param to also accept `{ universityIds?: string[]; universityNames?: string[] }` while keeping the existing `universityId`/`universityName` fields for backward compatibility.
- In `buildStudentRows`, if `universityIds` is provided and non-empty, filter `studentIds` to profiles whose `university_id` is in that set. If only the singular field is provided, behave as today.
- In the Overview sheet and filename, show a joined label:
  - 0 selected → "All universities"
  - 1 selected → that name (same as today)
  - 2+ selected → comma-joined names in the Overview cell; filename uses `Multi-<count>-universities` (kept short and filesystem-safe).
- `handleExportCourse` in `AdminCourses.tsx` passes the current selected ids + names.

No backend/schema/RLS changes.

## Verification
- Open `/admin/courses`, select 2 universities → table only shows courses with students from either; export for a course produces an XLSX scoped to students from those universities with the multi-university label in Overview and filename.
- Select 0 or all → behaves as "All universities" (unfiltered).
- Selecting exactly 1 matches the current behavior (regression check).
