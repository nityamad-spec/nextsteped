Add vertical scrolling to the student profile dialog on `/admin/students` so long content (many enrolled courses) is reachable.

## Change
In `src/components/admin/StudentProfileDialog.tsx`:
- Constrain `DialogContent` height (e.g. `max-h-[85vh]`) and make it a flex column.
- Keep the header fixed; wrap the body (student info + course cards list) in a scrollable container using `ScrollArea` (from `src/components/ui/scroll-area.tsx`) or a `div` with `overflow-y-auto flex-1`.

No logic, data, or layout changes beyond enabling vertical scroll inside the dialog.