## Root cause
Two issues on `/student/home`:

1. **Invalid DOM nesting** in "What to do today" cards (`src/pages/student/StudentHome.tsx` lines 623–655): a `<button>` wraps a `<Button>` (button-in-button). React logs a `validateDOMNesting` error, and the broken nesting can suppress hover events on descendants — including the tooltip triggers rendered right below in the Achievements card.
2. **Achievement tooltip triggers wrap a plain `<div>`** (`AchievementsCard.tsx` line 35). With `asChild`, Radix merges props onto the div, but a non-focusable div can miss hover/focus reliably (especially on touch or when React re-renders after the nesting error).

## Fix

**`src/pages/student/StudentHome.tsx`** (lines 623–655)
- Change the outer `<button>` to a `<div role="button" tabIndex={0}>` with `onClick` and keyboard handler, OR
- Remove the inner shadcn `<Button>` and keep the whole card as a single button (preferred: simpler). The inner `Button` currently duplicates the outer click; a chevron/`ArrowRight` icon + label span inside the outer button is enough.

Going with option 2: replace the inner `<Button>` with a styled `<span>` that visually looks like a pill button (uses the same variant classes) so the outer `<button>` remains a single interactive element.

**`src/components/student/AchievementsCard.tsx`**
- Change the `TooltipTrigger asChild` child from `<div>` to `<button type="button">` so the trigger is natively focusable and reliably fires hover/focus for the tooltip. Keep all existing classes.

## Scope
Frontend only, two files. No hook/logic changes. Tooltip content itself is already correct.

## Risk
- Turning the achievement tile into a real button gives it a default focus ring — mitigate with `focus-visible:ring-2 focus-visible:ring-ring focus:outline-none`.
- Replacing the inner Button with a span means the visible "action pill" is no longer a separate button; clicking anywhere on the card still triggers `action.action()`. That matches current behavior since the inner button already just called the same action.
