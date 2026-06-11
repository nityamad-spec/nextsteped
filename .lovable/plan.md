# Fix: Weekly Breakdown weeks won't drag-reorder

## Root cause

In `src/pages/teacher/CourseCreation.tsx` (lines ~1451–1858), the Weekly Breakdown uses framer-motion's `Reorder.Group` / `Reorder.Item`:

```tsx
<Reorder.Group axis="y" values={weeks} onReorder={...}>
  <div className="space-y-3">          {/* ← wrapper breaks reorder */}
    {weeks.map((w) => (
      <DraggableWeekItem key={w.id} value={w}> ... </DraggableWeekItem>
    ))}
  </div>
</Reorder.Group>
```

Framer-motion requires `Reorder.Item` to be a **direct child** of `Reorder.Group`. The intermediate `<div className="space-y-3">` means the Group can't track item positions, so:

- The grip's `onPointerDown` does call `controls.start(e)` (that part is fine), but
- The Group never sees the items as its children, so the drag has no siblings to swap with → the week visually doesn't move and `onReorder` never fires.

The grip handler itself is correct (`dragListener={false}` + `dragControls` + `touchAction: "none"` + `e.preventDefault()` + `controls.start(e)`), and `Reorder.Item` is correctly receiving a stable `value={w}` keyed by `w.id`.

## Fix

1. Remove the wrapping `<div className="space-y-3">` so `Reorder.Item`s are direct children of `Reorder.Group`.
2. Move the spacing onto `Reorder.Group` itself: `<Reorder.Group axis="y" values={weeks} onReorder={...} className="space-y-3 list-none p-0 m-0">` (Reorder.Group renders a `<ul>` by default — the list reset keeps the visual unchanged).
3. No other changes needed — `DraggableWeekItem` (lines 70–88), the grip pointer handler (lines 1465–1474), and `onReorder={(newOrder) => setWeeks(newOrder)}` are already correct.

## Files

- `src/pages/teacher/CourseCreation.tsx` — lines ~1451–1456 and the matching closing tags at ~1856–1858.

## Out of scope

- No changes to drag handle styling, week-number resync logic, or persistence. Pure structural fix so framer-motion can see the items.
