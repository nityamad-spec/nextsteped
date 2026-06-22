Add a filter panel to `/admin/students` (`src/pages/admin/AdminStudents.tsx`) that updates the table live.

## New filter controls (in the Card header, below the existing search row)

1. **Course filter — multi-select**
   - Popover trigger button: "Courses" + count badge when active.
   - Content: searchable checklist of every distinct course name across all students (sorted alphabetically). Built from `students` via `useMemo`.
   - Empty selection = all courses considered.

2. **Mastery level filter — multi-select**
   - Same popover-checklist pattern as the course filter.
   - Options are the distinct non-null `mastery` values across all enrollments (e.g. beginner, developing, proficient, expert). Sorted using the canonical mastery order when known, alphabetical otherwise.

3. **Match-logic toggle** (only enabled when ≥1 mastery level selected)
   - Two-button segmented toggle:
     - "All courses must match" (default) — every enrolled course's mastery is in the selected set.
     - "At least one course matches" — at least one enrolled course has mastery in the selected set.
   - Students with zero enrollments are excluded whenever a mastery filter is active.

4. **Match count + Clear button**
   - Inline summary: `Showing X of Y students`.
   - "Clear filters" button (ghost, shows only when any filter is active including the existing search) resets course set, mastery set, match mode (back to "all"), and search.

## Filtering logic (single `useMemo` replacing the current `filtered`)

Applied in order, all combined with AND:

```text
search       → existing name/email/roll/course substring match
courses      → student has at least one enrollment whose course name is in selected set
mastery+mode → "all": student has ≥1 course AND every course.mastery ∈ selected set
               "any": student has ≥1 course with course.mastery ∈ selected set
```

The count badge next to "Students" stays as total; a new muted `Showing X of Y` line appears next to the filters.

## UI notes

- Reuse shadcn `Popover` + `Command` (already in project) for the checklist UIs, or simple `Popover` + checkboxes if Command feels heavy — leaning Command for the built-in search.
- Match-logic uses `ToggleGroup` (type=single) for the two modes.
- Layout: filters live in a single flex-wrap row below the title/search row so the header stays clean on mobile.
- No data-fetching, schema, RLS, or backend changes. Pure client-side filtering over already-loaded `students`.

## Risks / notes

- Distinct course/mastery options are derived from currently-loaded students only — a course no one is enrolled in won't appear (matches the report's "complete set of courses per student" framing).
- "All courses must match" treats students with zero enrollments as non-matching when a mastery filter is active; called out in the toggle's tooltip so the behavior is explicit.
