# Learning Path UI Polish

## Goal
On `/student/learning-path`, make two small visual changes to the unit cards:
1. Remove the "Quiz due" tag from the unit header while keeping the readiness percentage chip that appears after a quiz is taken.
2. Make the "Your next move" banner more visually prominent by using a lighter shade of the primary indigo color so students can clearly see what action to take next.

## Changes
- `src/components/student/UnitPathwayCard.tsx`
  - Header chip: keep the readiness percentage display for taken quizzes, but do not render the chip when the quiz is not yet taken (i.e., remove the "Quiz due" branch).
  - "Your next move" container: change background from `bg-muted/40` to a light indigo tint such as `bg-primary/10` with `border-primary/20` so it stands out without clashing with the existing palette.

## Verification
- Open `/student/learning-path` in the preview.
- Confirm units that have not been started no longer show a "Quiz due" tag.
- Confirm units with a completed quiz still show the readiness percentage (e.g., "72% readiness · Ready").
- Confirm the "Your next move" section has a visible light-indigo background in both light and dark modes.

## Risks / Notes
- Very low risk; only presentation code is touched.
- No database or backend changes.
- Contrast should be checked in dark mode because `bg-primary/10` will render against the dark card background.
