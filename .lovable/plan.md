# Fix "current unit" mismatch on Learning Path

## Problem
The top banner and the open unit box pick the first unit whose quiz hasn't been taken (Unit 8). The "You're here" marker on Your path picks the first unit below the mastery goal (an earlier unit). Two rules, two answers.

## Fix
Use one rule everywhere: **the current unit is the first unit below the mastery goal** (same rule that controls unlocking).
- Top banner "You're on Unit X" shows that unit.
- The box at the bottom opens that unit by default (students can still click other units).
- "You're here" on the path stays on that unit.
- If every unit has reached the goal, all three point to the last unit.

## Technical details
In `src/pages/student/StudentLearningPath.tsx`:
- Compute `activeUnit` before `focusUnit` and set `focusUnit = lessonPlan.find(w => w.day === activeUnit) ?? last unit`; drop the `firstUnfinished` (quiz-taken) rule.
- `displayedUnit`, `openUnitDay` default, and the rail's `currentDay` all derive from it.
- No backend or data changes.
- Verify in the browser that banner, rail marker and open box show the same unit.
