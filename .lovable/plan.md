
## Goal
Restore hover descriptions on achievement badges on `/student/home`.

## Root cause
`AchievementsCard` renders `Tooltip` under the app-level `TooltipProvider` (in `App.tsx`), which uses Radix's default 700ms `delayDuration`. Combined with the inner `<p title={a.label}>` (a native browser tooltip) shadowing Radix, hover descriptions feel broken or never appear.

## Change — `src/components/student/AchievementsCard.tsx`
1. Import `TooltipProvider` and wrap the grid contents in `<TooltipProvider delayDuration={100}>`.
2. Remove the native `title={a.label}` attribute on the label `<p>` so it doesn't compete with the Radix tooltip.
3. Add `side="top"` and `sideOffset={6}` on both `TooltipContent` blocks for a stable position above the badge.

## Out of scope
- Tooltip copy (earned description + unearned howTo checklist) unchanged.
- No changes to other cards or the app-level provider.
