# Show each unit's concepts on the Learning Path

Right now a unit card shows only the unit title, the 3-step path, readings and a readiness percentage. The concepts that make up the unit are never listed, so a student cannot tell which tiles in the Concept Mastery map belong to which unit.

## What changes

On `/student/learning-path`, every unit card gains a **Concepts in this unit** section:

- Collapsed header row: the first 2-3 concept names as small chips, plus "+N more" when the unit has more.
- Expanded card: the full list of concepts, each with its own mastery percentage and a small colored dot using the same four mastery tiers as the home heatmap (Beginner / Developing / Proficient / Expert), so names and colors line up one-to-one with the Concept Mastery map.
- Concepts the student is weakest on are marked with a subtle "Focus" tag — the same ones already referenced in the "Study weak concepts" copy.
- Clicking a concept starts a study chat scoped to that concept (same navigation the Study button already uses).
- If a unit has no concepts attached in the lesson plan, the section is hidden entirely.

Names shown are exactly the lesson-plan concept names, which are what the mastery map keys off — no renaming or re-derivation.

## Technical notes

- `useUnitReadiness` already resolves each unit's concept names against the `concepts` table and each concept's mastery score, but only returns the aggregate readiness and the 3 weakest names. Extend its return with `conceptsByUnit: Record<number, { name: string; mastery: number; matched: boolean }[]>` built in the same `useMemo` — no extra queries.
- `StudentLearningPath.tsx` passes `conceptsByUnit[unit.day]` into `UnitPathwayCard` as a new `concepts` prop, and a `onStudyConcept(name)` callback reusing the existing `goToStudy(name, "start" | "weak")` helper.
- `UnitPathwayCard.tsx` renders the new section between "Your next move" and "This unit's path", plus the chips in the collapsed header.
- Mastery tier thresholds/colors are read from the existing mastery-level helper used by the home heatmap so the two surfaces cannot drift.
- Presentation-only: no database, scoring, or readiness-formula changes.
