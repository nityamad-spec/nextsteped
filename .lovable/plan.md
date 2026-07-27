## Goal

Update the "What to do today" section header on `/student/home`:
1. Replace the static `Preview` badge with `Personalised`.
2. Make the subheading dynamic: show "One focused activity", "Two focused activities", or "Three focused activities" based on the actual number of cards rendered (capped at 3), instead of the hardcoded "Three focused activities".

## Files touched

- `src/pages/student/StudentHome.tsx`
  - Line ~585: change `<Badge variant="secondary">Preview</Badge>` to `Personalised`.
  - Line ~578 (CardDescription): derive a label from `Math.min(nextActions.length, 3)` and render the correct singular/plural form.

## Out of scope

- No changes to card logic, priority rules, or layout beyond these two copy updates.
- No database or backend changes.

## Risks / constraints

- "Personalised" is British spelling; if the project consistently uses American spelling, we may want to confirm. No other risks.