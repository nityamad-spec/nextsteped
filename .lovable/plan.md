## Goal
Update the weekly quiz score card on `/student/home` so the three breakdown lines only appear when hovering over the "Completed — X%" line. On mobile, the breakdown remains always visible.

## Requirements (confirmed)
- **Hover target**: the entire "Completed — X%" text line.
- **Mobile behavior**: breakdown is always visible on touch devices.
- **Animation**: subtle fade-in when appearing.

## Current state
The breakdown is rendered unconditionally below the score line in `src/pages/student/StudentHome.tsx` (around the weekly quiz card inside the unit accordion). The data (`correctAnswers`, `totalQuestions`, `timeSpent`) is already fetched and formatted via existing helpers.

## Implementation plan

### 1. Wrap the score line in a hover group
In `src/pages/student/StudentHome.tsx`, wrap the `<p>` that shows `Completed — ${taken.score}%` and the conditional breakdown block in a container with Tailwind `group` and `relative` classes.

### 2. Hide breakdown by default, show on group hover
Apply Tailwind classes to the breakdown container:
- Hidden by default: `hidden` or `opacity-0`.
- Show on group hover: `group-hover:block` or `group-hover:opacity-100`.
- Add `transition-opacity duration-200` and `animate-fade-in` for the subtle fade animation.

### 3. Keep breakdown always visible on mobile
Use a responsive variant so mobile breakpoints bypass the hover hide:
- `max-sm:block` or `sm:group-hover:block sm:hidden` pattern, depending on the project's breakpoint convention.

### 4. Preserve existing content and helpers
Do not change the text, formatting helpers (`accuracyPct`, `formatAvgTime`), or the data fetch. Only change the visibility behavior of the existing breakdown block.

### 5. Verify
- Run TypeScript typecheck.
- Run `StudentHome.test.tsx` and any related tests.
- Report any failures per the project rule; do not auto-fix without approval.

## Risks / constraints
- **Touch devices**: hover groups do not work on touch, so the mobile override is required. The confirmed approach handles this.
- **Accessibility**: hiding information behind hover reduces discoverability. Since mobile always shows it and the score itself remains visible, this is acceptable for a score breakdown.
- **No data changes**: this is purely presentational; no backend or schema changes needed.

## Files to edit
- `src/pages/student/StudentHome.tsx`