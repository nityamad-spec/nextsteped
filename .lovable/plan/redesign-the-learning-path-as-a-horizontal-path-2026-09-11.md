# Redesign the Learning Path as a horizontal path

Replace the long vertical stack of unit cards with a single horizontal path of unit nodes and one detail panel underneath.

Note: only one screenshot came through (the collapsed/expanded rail). The completed-unit state will follow the green treatment described in your brief.

## Top of page

A slim progress header: a ring with overall percentage, plus "You're on Unit X — N of M units complete" and a line explaining that reaching 75% mastery in a unit unlocks the next one.

## The path rail

- One horizontal line of unit nodes joined by a track. The track is green up to the current unit and faint grey after it.
- Node states: done = green with a check; current = larger indigo circle with a "You're here" tag above; upcoming = white outline; far-future units dimmed.
- Short unit label under each node. No percentage on any node.
- A small legend (Done / You're here / Upcoming) sits above the rail.

### Automatic collapsing

- Always shown individually: the current unit plus two units either side.
- Earlier runs collapse into one green pill, e.g. "1–2 done". Later runs collapse into "+14 more".
- Purely derived from the current unit's position and the course length — works the same for 6 or 40 units, no configuration.

### Expand in place

- Tapping a pill expands those units inline on the same line; the line grows longer and becomes horizontally scrollable with a fade at the right edge. Never a second row.
- Tapping the pill again re-collapses it. The rail auto-scrolls to keep the current unit in view.

## Unit detail panel

Shows one unit at a time — the current unit by default; clicking any node swaps to that unit. Nothing is locked; every unit is clickable.

- Header: unit number, title, Teaching / Coding Lab badges, and a single mastery bar showing the unit's mastery against the 75% goal line. This is the only percentage on screen.
- "Your next move": one headline, one supporting sentence, one primary button.
- "Your path for this unit": three small step cards in a row — Study, Practice, Weekly Quiz. Each shows a state dot (done / in progress / locked) and a one-line status.
- Coding/lab units: the third card becomes "Coding Exercises" with a done count, expanding to the exercise list which opens each in the terminal.
- Concepts and Readings become compact collapsed sub-sections at the bottom, opened on tap.
- When the unit is complete (mastery ≥ 75% and steps done), the panel takes the green completed treatment, all three steps show checks, and the next move becomes "Go to Unit [next]" which moves the rail and panel forward.

## Next-move rules

- Not started → Start studying.
- Studied → Practice (questions, or code terminal for coding courses).
- Practised → Take the weekly quiz.
- Quiz taken but below 75% → "Keep practicing to raise your mastery"; the quiz card shows the score and Locked; practice is the primary button.
- Ready → Go to next unit.
- Existing quiz rules are unchanged: still one attempt, with the professor's existing unlock/void behaviour intact. Only the wording and layout change.

## Mobile

Same rail, horizontally scrollable, with fewer nodes shown around the current unit and the pills doing more of the work.

## Technical notes

- `src/pages/student/StudentLearningPath.tsx` keeps all existing data loading (`useLearningPlan`, `useUnitReadiness`, `useUnitProgress`, quiz results, void counts, exercises, soft skills) and switches to the new presentation.
- New components under `src/components/student/`: `UnitPathRail.tsx` (nodes, pills, expand-in-place, scroll/fade), `UnitDetailPanel.tsx` (header, next move, step row, collapsed sub-sections), plus a small pure helper `src/lib/unitRail.ts` that turns (units, current, expanded pills) into the rendered rail items — unit-tested for 6-, 20- and 40-unit courses.
- `computeUnitStage` and all progress/readiness logic are reused unchanged; `UnitPathwayCard.tsx` is retired once the panel replaces it.
- Colours come from existing semantic tokens; no new hardcoded colours.
