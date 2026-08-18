# Fix Focus tag logic on Learning Path concept lists

## Root cause

`useUnitReadiness.ts` builds `weakConceptsByUnit` as the 3 lowest-scoring concepts in each unit. When a unit has 3 or fewer concepts and they all have high mastery (e.g. 100%), every concept still lands in the "weakest" list, so `UnitPathwayCard` tags them all with Focus. The tag is currently tied to relative rank, not absolute mastery level.

## What changes

On `/student/learning-path`, the Focus badge under each unit's concept list will be driven by mastery level instead of relative weakness:

- A concept gets the Focus tag when its mastery level is anything other than **Expert**.
- This applies immediately, before or after the unit quiz.
- "Not explored" (0% / no attempts) concepts are also tagged Focus because they are not expert.
- The existing `weakConcepts` list is still used for the "Study weak concepts" copy and for the default study/practice targets, but it is no longer used to decide the Focus badge.

## Technical notes

- In `UnitPathwayCard.tsx`, compute each concept's mastery level with the existing `getMasteryLevel` helper (already imported).
- Replace the Focus condition from `isWeak && quizTaken` to `level !== "expert"`.
- Keep the colored mastery dot and percentage unchanged so the badge, dot, and percentage stay consistent.
- No backend, scoring, or readiness formula changes; this is a presentation-only fix.

## Verification

- Add/update a unit test for `UnitPathwayCard` that renders concepts at 100%, 75%, 0%, and not-explored, asserting Focus appears only on non-expert concepts.
- Run the full frontend test suite and confirm no regressions.
