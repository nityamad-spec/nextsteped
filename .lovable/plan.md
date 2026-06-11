## Problem

On `/teacher/setup/lesson-plan` (`src/pages/teacher/CourseCreation.tsx`), the week cards use `Reorder.Group` / `Reorder.Item` from framer-motion, but the entire card header is wrapped in a `<button>` (the expand/collapse toggle at line 1415), with more `<button>`s nested inside it (regenerate, delete, etc. — confirmed by the `validateDOMNesting: <button> cannot appear as a descendant of <button>` warning in the console).

Two consequences:
1. The native `<button>` swallows pointer-down for drag intent — pressing the row fires click/toggle instead of starting a drag.
2. The `GripVertical` icon is purely decorative; framer-motion has no idea it should be the handle.

So dragging a week never initiates a reorder.

## Fix

Convert the week list to framer-motion's **drag-handle pattern** so only the grip starts a drag, and clean up the nested-button structure that's also blocking pointer events.

### Changes in `src/pages/teacher/CourseCreation.tsx`

1. Import `useDragControls` from `framer-motion`.
2. Extract each week row into a small `WeekReorderItem` component (needed because `useDragControls` must be called per item).
3. On each `Reorder.Item`, set `dragListener={false}` and `dragControls={controls}`.
4. Replace the outer `<button onClick={toggleWeek}>` (line 1415) with a `<div role="button" tabIndex={0}>` that toggles on click / Enter / Space. This removes the nested-button DOM violation and lets pointer events flow to the grip.
5. Turn the `GripVertical` icon into the drag handle:
   - Wrap it in a span with `onPointerDown={(e) => controls.start(e)}`, `style={{ touchAction: "none" }}`, `cursor-grab active:cursor-grabbing`, plus `role="button"` + `aria-label="Drag to reorder"`.
   - `e.stopPropagation()` on pointer-down so it doesn't also toggle expand.
6. Keep `onReorder={(newOrder) => setWeeks(newOrder)}` and the existing week-number re-labelling logic that runs after reorder (per memory).

### Verification

- Drag a week by the grip → list reorders, week numbers re-label, "unsaved changes" indicator appears.
- Click anywhere else on the header → still expands/collapses.
- Inner action buttons (regenerate, delete, exam toggle) still work and no longer trigger the nested-button warning.
- Touch drag works on the 849px viewport the user is on (`touch-action: none` on the handle).

### Out of scope

`TeachingPlan.tsx` uses the same `Reorder` pattern for day cards; not touching it unless the user reports the same bug there.
