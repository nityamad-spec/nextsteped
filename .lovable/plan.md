## Goal
Make the Courses column compact (collapsible dropdown per row) and clean up the overall report UI on `/admin/students`.

## Changes (single file: `src/pages/admin/AdminStudents.tsx`)

1. **Courses cell → dropdown.**
   - Replace the inline stacked list with a `Collapsible` (shadcn) trigger: `<Button variant="outline" size="sm">` showing `<BookOpen /> N courses <ChevronDown />` (chevron rotates on open).
   - Open state holds an indented panel directly under the trigger (same cell) listing each course on its own row: course name (font-medium), mastery `<Badge>` (or muted "no mastery"), joined date (muted, small).
   - Zero-enrollment students show a muted "Not enrolled" pill instead of the trigger.
   - Per-row open state stored in a `Set<string>` keyed by `group.key`.

2. **Report UI polish (visual only, no data changes).**
   - Card: add subtle header description ("Grouped by email — each student appears once with all enrollments") and a search input (filters by name / email / roll number, client-side).
   - Header row: count badge ("12 students") moved to the right of the title; add a small "Multiple accounts" legend chip when any merged row exists.
   - Table: zebra rows (`even:bg-muted/30`), sticky header, tighter vertical rhythm, hover highlight, top-aligned cells.
   - Email cell: monospace + truncate with title attr for long addresses.
   - Joined column: relative date ("3d ago") with full date in tooltip.
   - Action button: keep `MoreHorizontal`; multi-account rows show the existing disabled tooltip unchanged.
   - Empty state: keep current copy, add `GraduationCap` icon centered.

3. **No changes** to the data fetch, grouping logic, delete flow, RLS, schema, edge functions, or routes.

## Risks
- Search is client-side only — fine at admin scale, will need server-side filtering if student count grows large.
- `Collapsible` adds vertical height per row when expanded; long course lists will push siblings down (expected behavior of an inline dropdown). If you'd rather use a popover overlay instead, say so.
- Relative-date helper is a tiny inline util (no new dependency).

## Questions
1. Inline collapsible (expands the row, multiple can be open) — or a popover overlay (floats above, one at a time)? Default: inline collapsible.
2. Keep the per-course "joined" date inside the dropdown, or drop it to keep the panel minimal? Default: keep it.