## Problem

On `/admin/dashboard`, opening a course's diagnostic drill-down shows a `Students (N)` tab with a wide table (Student, Roll, Score, Level, Branch, Avg time/q, Completed, action). On smaller viewports (e.g. the 681px preview), the rightmost columns get clipped horizontally and the row list runs past the dialog without a reliable vertical scrollbar — users can't see all 14 students who took the diagnostic.

The dialog (`DialogContent`) is already `max-h-[90vh] overflow-hidden flex flex-col` and the inner `ScrollArea` is `flex-1 pr-4`, but the wide `<Table>` forces horizontal overflow on the ScrollArea's viewport, which interferes with vertical scrolling on narrow screens.

## Fix (scoped to `src/components/admin/DiagnosticsAnalytics.tsx`)

1. In the `Students` `TabsContent`, wrap the `<Table>` in a horizontally scrollable container so wide columns scroll sideways instead of clipping:
   - `<div className="w-full overflow-x-auto rounded-md border"> <Table className="min-w-[760px]"> … </Table> </div>`
2. Ensure the outer `ScrollArea` reliably provides vertical scroll for the full student list:
   - Keep `<ScrollArea className="flex-1 pr-4">` but add `min-h-0` to the parent flex chain so it actually shrinks: confirm `DialogContent` stays `flex flex-col max-h-[90vh] overflow-hidden`, and add `min-h-0` to the `ScrollArea` wrapper if needed.
3. No changes to data fetching, columns, CSV export, row click handler, or the Concepts/Tier tabs.

## Validation

- Open `/admin/dashboard`, click into a course (e.g. GAIL), switch to `Students (14)`.
- At 681px width: horizontal scrollbar appears under the table, all 8 columns reachable; vertical scroll reveals all 14 rows inside the dialog.
- At desktop width: no horizontal scrollbar; vertical scroll still works when rows exceed dialog height.
- Concept performance and Tier accuracy tabs unchanged.

## Out of scope

- Edge function auth changes, DB rollback, column redesign, pagination, or virtualization.
