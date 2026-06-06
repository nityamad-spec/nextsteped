# Fix: scroll inside Weekly Quiz Review dialog

## Problem
`WeeklyQuizReviewDialog` uses `DialogContent` with `flex flex-col max-h-[85vh]` and a `ScrollArea` child with `flex-1`. In a flex column, a child with `flex-1` won't shrink below its content unless it also has `min-h-0`. Result: the ScrollArea expands to fit all questions, pushing the dialog past the viewport so the inner scroller never engages — only the page scrolls (or nothing does).

## Fix
In `src/components/WeeklyQuizReviewDialog.tsx`:

1. Add `min-h-0` to the `ScrollArea` (and to its viewport via class) so the flex child can shrink and become scrollable.
2. Make the `DialogHeader` `shrink-0` so it doesn't get squeezed.
3. Tighten the height calc so the scroll region has a guaranteed bounded height: keep `max-h-[85vh]` on `DialogContent`, plus an explicit `overflow-hidden` on `DialogContent` to prevent the outer dialog from growing.

Concretely:
- `DialogContent` → add `overflow-hidden`
- `DialogHeader` → add `shrink-0`
- `ScrollArea` → `flex-1 min-h-0 pr-3 -mr-3`

No other behavior changes.
