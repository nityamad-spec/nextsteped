Root cause found: the drag interaction fires, but `onReorder` calls `setWeeks(newOrder)`, and the local `setWeeks` wrapper immediately calls `normalizeWeeks(next)`. `normalizeWeeks` sorts by the existing `week` number before renumbering, so the dragged array is sorted back into its original order every time.

Plan:
1. Add a separate helper for preserving the current array order while renumbering weeks, e.g. `renumberWeeksInCurrentOrder(list)`.
2. Keep `normalizeWeeks` for restore/database/generated-plan loading, where sorting by `week` is still useful.
3. Change only the Weekly Breakdown `Reorder.Group` handler to use the new helper directly:
   - accept `newOrder` from framer-motion
   - renumber based on that dragged order
   - mark the plan unpublished, matching current behavior
4. Leave the existing drag handle, card layout, persistence effect, and publish flow unchanged.

Expected result: dragging Week 1 below Week 2 will immediately reorder the cards and relabel them sequentially, instead of snapping back.