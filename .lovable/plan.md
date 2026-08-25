# Coding/lab weeks: freeform terminal for Practice, exercises as Step 3

## What's wrong today

For coding/lab units on `/student/learning-path`, Step 2 (Practice) routes to `/student/chat?terminal=1&unit=N`. The chat deep-link handler then auto-selects the unit's **first published exercise** (`selectTerminalExercise` fallback), so "Practice" opens the terminal pre-filled with an exercise — the same thing Step 3's exercise cards do. Practice and the exercise step are effectively duplicated.

## Target behavior (coding/lab weeks only)

```text
Step 1  Study            → chat in study mode (unchanged)
Step 2  Practice         → code terminal, blank — no exercise pre-loaded
Step 3+ Coding exercises → one card per published exercise, terminal
                           pre-filled with that exercise (unchanged)
```

Teaching weeks in coding-approved courses keep their current behavior (practice opens the terminal; they have no exercises so nothing is pre-filled — already effectively freeform).

## Changes

1. **`src/pages/student/StudentLearningPath.tsx`** — in `goToPractice`, when the unit is a coding/lab week and coding is approved, navigate to `/student/chat?terminal=1&unit=N&freeform=1`. Non-coding units keep the existing route.

2. **`src/pages/student/AIChat.tsx`** — terminal deep-link handler: when `freeform=1` is present, skip `selectTerminalExercise` entirely and open the terminal with no starter code, language, or problem statement (`terminalContext` stays null/empty). The `coding_terminal_sessions` log row is still written with `week_number = unit` (this is what `useUnitProgress` counts as practice completion), but **no** `coding_exercise_progress` row is written — freeform practice must not mark any exercise complete. When `freeform` is absent (exercise step cards), behavior is unchanged.

3. **`src/components/student/UnitPathwayCard.tsx`** — copy only: for coding weeks, the Practice step description changes from "Work on this unit's coding exercise in the code terminal" to freeform wording (e.g. "Open the code terminal and practise this unit's concepts hands-on — it counts towards your readiness."). The "Your next move" studied-stage line gets the same treatment for coding weeks. Exercise step cards (index 3+) are untouched.

4. **No database or hook changes.** `useUnitProgress`, `unitStage.ts`, `selectTerminalExercise`, and the exercise cards all stay as-is.

## Tests

- `UnitPathwayCard.test.tsx`: coding-week practice copy reflects freeform terminal practice; exercise cards still render unchanged.
- `codingExercises.test.ts` or a small handler test: `freeform=1` skips exercise selection (covered by extracting the "should select exercise" decision into a tiny pure helper, e.g. `shouldAutoSelectExercise(searchParams)`, and testing it).

## Verification

- Coding/lab unit: Step 2 opens a blank terminal, practice tick appears after opening, no exercise gets a tick.
- Exercise card: opens terminal with that exercise's starter code + statement, only that exercise ticks.
- Teaching unit in a coding course: practice behavior unchanged.
