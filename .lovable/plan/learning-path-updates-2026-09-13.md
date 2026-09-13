# Learning Path updates

Four changes to the student Learning Path.

## 1. Units spread out when they fit

Today the path always collapses distant units into "+N more" pills and shows the hint
"tap a group to expand it in place, then scroll". With only a few units that is unnecessary.

- Measure the available width. If every unit fits on one line, show them all, evenly spaced
  across the card with comfortable gaps and room for full two-line labels.
- The "tap a group to expand it, then scroll" hint and the collapsed pills only appear when
  the units genuinely do not fit.
- Legend, node colours, selection and the detail panel below stay exactly as they are.

## 2. Mastery goal 90% and strict unit order

- The mastery goal changes from 75% to 90% everywhere a student sees it (home, learning path,
  unit cards, achievements, progress).
- A unit is "reachable" only when every earlier unit in Stage 1 / Stage 2 is at 90%.
- A student can still click any unit and read its overview, concepts, readings and the three
  steps — but for a unit they have not reached yet, the Study / Practice / Quiz buttons and the
  "Your next move" button are hidden, replaced with a short line such as
  "Reach 90% mastery in Unit 2 to unlock this unit."
- Career Readiness and the Capstone stay open as they are today.

## 3. Rename "Weekly Quiz" to "Unit Quiz"

Renamed everywhere a student sees it: learning path step cards and copy, home page, the quiz
window itself, results and gate messages. Teacher and admin wording is left unchanged.

## 4. "You are here" at the top

Under the goal box at the top of the page, add a clear position line, e.g.
"You're here: Stage 1 · Unit 1 — Python & Tooling" with the unit's current mastery and the 90%
goal. On academic courses (no stages) it reads "You're here: Unit 1 — ...".

## Technical notes

- `src/hooks/useUnitReadiness.ts`: `READINESS_THRESHOLD` 75 → 90.
- `src/components/student/UnitPathRail.tsx`: container-width measurement (ResizeObserver already
  present) drives a `fitsOnOneLine` flag; when true, skip `buildRail` pills, render all units with
  `justify-between`, hide the scroll hint and fade.
- `src/pages/student/StudentLearningPath.tsx`: compute `unlockedUpTo` (first unit under 90% in the
  ordered technical unit list); pass `locked` + `unlockReason` into `UnitDetailPanel`; add the
  "You're here" card, resolving the stage from `buildPathwayStages` for employment courses.
- `src/components/student/UnitDetailPanel.tsx`: when `locked`, hide the next-move button and make
  the step cards non-clickable, keeping all descriptive content.
- Student-facing "Weekly Quiz" strings updated in `UnitDetailPanel.tsx`, `StudentHome.tsx`,
  `WeeklyQuizDialog.tsx`, `WeeklyQuizReviewDialog.tsx`, `DiagnosticGateDialog.tsx`, `AIChat.tsx`
  (component/file names unchanged).
- No database changes. Existing tests updated for the new threshold; typecheck plus screenshots at
  narrow and wide widths to confirm the spacing behaviour.
