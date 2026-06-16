## Fix concept mastery map legend color

On `/student/home`, the legend swatch for "Deeply explored" uses `bg-primary/40`, but the actual grid tile for that state uses solid `bg-primary` (see `getMasteryColor` in `src/pages/student/StudentHome.tsx`). The other two swatches ("Not explored" and "Touched") already match.

### Change

In `src/pages/student/StudentHome.tsx` (line 583), update the "Deeply explored" legend swatch:

- From: `<div className="h-3 w-3 rounded bg-primary/40" />`
- To: `<div className="h-3 w-3 rounded bg-primary" />`

No other changes. "Not explored" (`bg-background border`) and "Touched" (`bg-primary/20`) remain as-is since they already match the grid.
