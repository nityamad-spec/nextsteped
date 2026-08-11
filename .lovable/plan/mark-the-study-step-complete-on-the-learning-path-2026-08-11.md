# Mark the Study step complete on the Learning Path

## What's wrong today

On `/student/learning-path`, the unit's three-step path only shows a completion tick on step 3 (Weekly Quiz). Steps 1 (Study) and 2 (Practice) never show as done, even though the page already knows both: `studied` and `practised` are passed into `UnitPathwayCard` and already drive the "Your next move" banner.

## Change

In `src/components/student/UnitPathwayCard.tsx`, presentation only:

- Step 1 (Study): pass `done={studied}`. When done, the tick appears and the button reads "Keep studying" instead of "Start studying"; description gains a short "Completed" note. The button stays enabled — studying is never locked.
- Step 2 (Practice): pass `done={practised}`. When done, button reads "More practice". Stays enabled.
- Step 3 stays exactly as it is.

No changes to `useUnitProgress`, `unitStage.ts`, data loading, or the database. Completion signals are the ones already computed (a study-mode chat session with 2+ user messages attributed to the unit, or attempted concept mastery).

## Verification

- A unit where the student has chatted about the topic shows a tick on Study and "Keep studying".
- A unit with a completed practice set shows a tick on Practice.
- A fresh unit shows no ticks.
