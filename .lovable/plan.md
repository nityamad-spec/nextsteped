# Learning Path: one 3-step pathway per unit

Replace the current accordion-of-activities layout with a page where every unit gets the same Study → Practice → Quiz pathway card, and course progress sits at the top.

## Page structure (top to bottom)

1. Page header (Learning Path + course name)
2. Course Progress card — moved to the very top, above everything else
3. One unit pathway card per unit, in order

The old "Your Learning Path" wrapper card with the per-unit accordion rows, status pills, and dot progress trackers is removed.

## Unit pathway card

Each unit renders the same card:

- Header: `UNIT n · Topic`, plus a readiness chip (`x% readiness` / `Ready`, or `Quiz due` before the quiz)
- Inline "Your next move" block for that unit only (no global banner anymore): 
  - Quiz not taken → "Start studying"
  - Quiz taken, readiness below 70% → "Study and practice", naming weak concepts
  - Readiness at or above 70% → "Ready — move on to Unit n+1"
- Three steps:
  1. **Study** — teaching assistant deep-dive; step text also points to the unit's readings ("N readings in this unit")
  2. **Practice** — scored AI practice questions
  3. **Weekly Quiz** — single scored attempt (shows Locked when the attempt is voided twice, or Completed once taken)
- **Readings & exercises** — collapsible sub-section at the bottom of the card listing the unit's resources with the existing done-checkboxes and type badges (article, coding-exercise, Optional). Collapsed by default.

## Expansion behaviour

- The current unit's card is expanded by default.
- Other units collapse to a single row: unit number, topic, readiness chip; clicking expands the full pathway.
- All units are always interactive — future units are not locked; students may study, practice, or take any published quiz at any time. (Quiz buttons still disable when the professor hasn't published that week's quiz.)

```text
[ Course Progress ---------------------------- 45% ]

Unit 1  Introduction to Formal Languages     82% Ready   v
Unit 2  Finite Automata                      Quiz due    ^
   Your next move: Start studying
   [1 Study] [2 Practice] [3 Weekly Quiz]
   > Readings & exercises (3)
Unit 3  Regular Expressions                  Quiz due    v
```

## Technical notes

- `src/components/student/UnitFocusCard.tsx` becomes a reusable per-unit card (`UnitPathwayCard`): add `expanded`, `onToggle`, `resources`, `activityDone`, `onToggleActivity` props; keep existing study/practice/quiz callbacks and readiness logic.
- `src/pages/student/StudentLearningPath.tsx`: reorder to progress-first, map `lessonPlan` to one card each, drop the accordion block (status pill/avatar/dot-tracker code), keep `expandedWeeks`, `activityDone` localStorage, quiz dialog, diagnostic gate, and void-count logic as-is.
- `useUnitReadiness` and the 70% threshold are unchanged; Course Progress keeps counting units at 70%+ readiness.
- No database or edge function changes.
