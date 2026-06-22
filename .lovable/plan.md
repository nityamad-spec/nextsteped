Switch course and mastery filters in `/admin/students` (`src/pages/admin/AdminStudents.tsx`) to strict AND semantics, and remove the All/Any toggle.

## Filter behavior

- **Course filter (AND):** student must be enrolled in every selected course. Selecting Course A + Course B shows only students enrolled in both.
- **Mastery filter (strict AND):**
  - Every selected mastery level must appear in the student's courses, AND
  - Every course the student has must have a mastery level within the selected set.
  - Picking only `expert` therefore shows students whose courses are all at expert level (the original example from earlier).
  - Students with zero enrollments are excluded when a mastery filter is active.

## UI changes

- Remove the `ToggleGroup` ("All courses match" / "At least one") and its surrounding Tooltip.
- Remove `masteryMode` state and its references in `clearAll`.
- Keep the popovers, multi-select chips, "Showing X of Y" count, and Clear button as-is.
- Add small helper text under each filter button (or a short inline note) clarifying AND semantics: "Matches students in all selected courses" / "Matches students whose courses all fall within the selected levels".

## Filtering logic (replaces current block)

```text
courses (AND): every c in selected → student.courses contains course named c
mastery (strict AND, only when set non-empty):
  student.courses.length > 0
  every m in selected → student.courses some c.mastery == m
  every c in student.courses → c.mastery in selected
search: unchanged
```

## Risks / notes

- Strict mastery AND is exclusionary — a student with one course outside the selected set is filtered out even if they also have a matching expert course. This matches the user-stated "students whose courses are all at the expert level" example, but should be reflected in the helper text so admins don't think the filter is broken.
- No data, schema, or backend changes.
