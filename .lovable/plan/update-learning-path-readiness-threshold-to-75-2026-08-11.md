# Update Learning Path Readiness Threshold to 75%

## Goal

Align the student Learning Path "readiness" threshold with the Expert mastery band (≥ 75%) by changing the single source-of-truth constant from 70 to 75.

## Current State

- `src/hooks/useUnitReadiness.ts` exports `READINESS_THRESHOLD = 70`.
- The constant is consumed by:
  - `src/lib/unitStage.ts` — stage computation (ready vs. needs_work)
  - `src/components/student/UnitPathwayCard.tsx` — banner copy and chip text
  - `src/pages/student/StudentLearningPath.tsx` — course progress summary
  - `src/pages/student/StudentHome.tsx` — "What to do today" cards and footer
- UI strings already reference the constant dynamically, so no hardcoded "70" strings need updating.

## Changes

1. In `src/hooks/useUnitReadiness.ts`, change `READINESS_THRESHOLD` from `70` to `75`.
2. Verify no other files hardcode `70` for readiness logic (search `READINESS_THRESHOLD` and literal `70` in student/learning-path contexts).
3. Run typecheck/tests to ensure imports and consumers remain valid.
4. Visually verify `/student/learning-path` and `/student/home`:
  - "Ready" chip/banner now appears at 75%+
  - Progress summary reads "X of N units at 75%+ readiness"
  - Students at 70–74% show "Study and practice" / "needs work" state instead of "ready"

## Risks / UX Impact

- Students currently at 70–74% readiness will immediately flip from "ready" to "needs_work" and will be prompted to study/practice instead of proceeding to the next unit.
- Course progress percentage may drop for active students.
- No database or API changes are required; this is a client-side constant change only.

## Questions

1. Should we also update the goal text on `/student/home` from "70% mastery / Goal" to "75% mastery / Goal" as part of this change? yes update it 
2. Do you want a one-time in-app notice or tooltip explaining why the readiness bar moved from 70% to 75%? no