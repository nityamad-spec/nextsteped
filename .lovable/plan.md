# Fix Career Readiness Timeline Line Overflow

## Problem
On `/student/career-readiness` → Step 1 "Understand" → "The rounds you'll face" timeline, the vertical connecting line rendered by the `before:` pseudo-element in `UnderstandBriefing.tsx` extends below the last numbered circle (the "4"). It should stop at the vertical center of that circle.

## Root cause
The timeline container uses `before:bottom-6` (24 px from the container bottom). The last circle's center sits farther from the bottom than 24 px because the circle has `mt-4` and the card has `min-h-24`, so the line overshoots the badge.

## Fix
In `src/components/student/employment/UnderstandBriefing.tsx`, replace the timeline container's `before:bottom-6` with a bottom offset that aligns with the center of the last numbered circle. Compute from the rendered layout:
- Circle height: `h-10` = 40 px
- Circle top margin: `mt-4` = 16 px
- Circle center from item top: 16 px + 20 px = 36 px
- Last card minimum height: `min-h-24` = 96 px
- Therefore circle center from container bottom ≈ 96 px - 36 px = 60 px = `3.75rem`

Change the className on the rounds wrapper from:
`before:bottom-6`
to:
`before:bottom-[3.75rem]`

Keep `before:top-6`, `before:left-[1.1875rem]`, `before:w-px`, `before:bg-career-round-4-border`, and the rest of the layout unchanged.

## Verification
1. Run TypeScript check.
2. Open `/student/career-readiness` for an employment-pathway course in the authenticated preview.
3. Screenshot the "The rounds you'll face" section and confirm the vertical line stops at the center of the "4" circle and does not extend below it.
