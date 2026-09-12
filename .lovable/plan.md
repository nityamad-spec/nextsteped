# Color-code "Openings matched to you" progress bars

Match each opening's progress-bar fill color to its status label color on the student home page.

## What changes

1. **Progress component** — add an optional `indicatorClassName` prop to `src/components/ui/progress.tsx` so the filled portion can be styled independently of the track.
2. **MatchedOpeningsSection** — in `src/components/student/employment/MatchedOpeningsSection.tsx`, map each status to a fill color:
   - Ready → green
   - Stretch → amber/orange
   - Early → muted gray
3. Pass the mapped class into `<Progress indicatorClassName={...} />` for each card.

## Out of scope

- No database or schema changes.
- No behavior changes; only the bar color changes.
- Other progress bars on the home page are not affected unless requested.

## Verification

- TypeScript typecheck passes.
- Preview shows green bar for Ready, amber bar for Stretch, gray bar for Early.
