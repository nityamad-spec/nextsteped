Change mastery filter on `/admin/students` from strict AND to OR semantics in `src/pages/admin/AdminStudents.tsx`.

## New behavior

- **Mastery filter (OR):** student passes if at least one of their courses has a mastery level in the selected set.
- When the course filter is also active, mastery is evaluated only against the courses that match the selected course filter (so "selected courses" in the user's phrasing is honored). When no course filter is set, mastery is evaluated across all of the student's courses.
- Students with zero matching courses are excluded when a mastery filter is active.
- Course filter behavior unchanged (still AND — student must be in every selected course).

## Code change

Replace the current strict-AND mastery block in the `filtered` `useMemo` with:

```ts
if (masteryFilter.size > 0) {
  const pool = courseFilter.size > 0
    ? s.courses.filter(c => courseFilter.has(c.name))
    : s.courses;
  if (!pool.some(c => c.mastery && masteryFilter.has(c.mastery))) return false;
}
```

Update the helper text under the filter row to reflect mixed logic:
"Courses use AND (must be in all selected). Mastery uses OR (any selected level matches)."

No data, schema, or backend changes.
