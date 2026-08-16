# Jump from a concept tile to its unit

On `/student/home`, the tiles in the full **Concept mastery map** are static. They should become clickable: clicking a concept takes the student to `/student/learning-path`, opens the unit that concept belongs to, and scrolls it into view.

## What changes

- Each concept tile in the mastery map dialog becomes a button with a hover/focus state and a tooltip line like "Go to Unit 3 — Loops".
- Clicking closes the dialog and navigates to `/student/learning-path?unit=3&concept=<name>`.
- On the Learning Path, the target unit is expanded (others left as they are), scrolled into view, and briefly highlighted with a ring so the student sees where they landed.
- Concepts that aren't attached to any lesson-plan unit stay non-clickable and show "Not in a unit yet" in the tooltip.

## Technical notes

- `StudentHome` already loads `lessonPlan` via `useLearningPlan`. Build a `unitByConcept: Record<conceptId, { unit: number; topic: string }>` map by matching each lesson-plan week's concept names against the `concepts` list using the existing `normaliseConcept` helper in `src/lib/unitStage.ts` (case/punctuation-insensitive), and pass it into `ConceptMasteryDialog`.
- `ConceptMasteryDialog` gains optional props `unitByConcept` and `onSelectConcept(conceptId)`; tile markup switches from `div` to `button` only when a unit is known, keeping the existing mastery colors and labels unchanged.
- `StudentLearningPath` reads `unit` from `useSearchParams` once the lesson plan has loaded: adds it to `expandedWeeks`, then `scrollIntoView({ behavior: "smooth", block: "start" })` on that card. The unit param is cleared from the URL after handling so a later collapse isn't undone by re-runs.
- `UnitPathwayCard` accepts an optional `id`/forwarded container id (e.g. `unit-card-3`) used as the scroll target; no other card behaviour changes.
- Presentation and navigation only — no database, scoring, or readiness changes.
