# Restyle the "Your path" section

Match the attached screenshot. Only the horizontal path strip changes — the unit detail panel below it stays exactly as it is.

## What changes

- **One continuous track.** Instead of separate short bars between circles, draw a single rounded track that runs behind the whole line and stops at the last item. The part up to the current unit is solid green; the rest is a faint grey.
- **Bigger, cleaner nodes.** Completed units become filled green circles with a white check. The current unit is a filled indigo circle, larger, with a soft indigo halo ring around it and the "You're here" tag above. Upcoming units are white circles with a thin grey outline and grey number. Units far ahead stay slightly dimmed.
- **Labels.** Two lines under each circle: "Unit N" then the concept name, centred, truncated. The current unit's label is indigo and bold.
- **Group pills.** Collapsed runs render as wide rounded pills sitting on the track: a completed run gets a soft green pill reading "1–2 done", a future run gets a dashed grey pill reading "+14 more ›". Both keep the three-dot glyph on the left and expand in place when tapped, as today.
- **Helper line** above the rail stays ("All N units on one line · tap a group to expand it in place, then scroll →").
- **Legend** (Done / You're here / Upcoming) stays in the header.

## Unchanged

Rail building and collapsing logic (`src/lib/unitRail.ts`), scroll-into-view behaviour, node selection, and the detail panel.

## Technical notes

- Edit `src/components/student/UnitPathRail.tsx` only.
- Replace the per-item connector `div`s with an absolutely positioned track layer behind the node row, plus a green fill layer whose width is measured from the current node's offset (`useLayoutEffect` + refs, recomputed on expand/resize).
- Keep spacing via the existing flex row with `gap`, so the measured fill stays accurate.
- Use semantic tokens (`bg-primary`, `bg-muted`, existing emerald usage for the done state) — no new hardcoded colours beyond what the file already uses.
