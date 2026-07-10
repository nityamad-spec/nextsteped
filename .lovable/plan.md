## Goal
Make the "Add teacher to a course" picker in the admin Teacher Profile dialog easy to use when there are many courses by adding a searchable, scrollable combobox.

## Change
In `src/components/admin/TeacherProfileDialog.tsx`, replace the current shadcn `Select` used inside the "Add to course" AlertDialog (around lines 465–476) with a Popover + Command combobox (same pattern as `src/components/CourseSwitcher.tsx`):

- Trigger: outline button showing the selected course name (or "Select a course…" placeholder) plus a chevron, full width.
- Popover content (`w-[--radix-popover-trigger-width]`, `p-0`):
  - `CommandInput` with placeholder "Search courses…" — filters by course name and course code.
  - `CommandList` with `max-h-64 overflow-y-auto` for scroll.
  - `CommandEmpty`: "No courses found." (and the existing "No other courses available" case when `availableCourses` is empty).
  - `CommandItem` per course showing `{name} — {course_code}` and a check icon on the currently selected one; `onSelect` sets `addCourseId` and closes the popover.
- Keep existing `addCourseId` state, `availableCourses` data, and Add/Cancel footer behavior unchanged.

## Notes
- Purely a UI change inside one file; no data, permission, or business-logic changes.
- Reuses already-imported shadcn primitives (`Popover`, `Command*`) pattern from `CourseSwitcher`; add the small extra imports needed.
