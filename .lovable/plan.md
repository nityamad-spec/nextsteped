## Make "Unit X of Y" reflect the next unit after the last passed quiz

**Current behavior** (`src/pages/student/StudentHome.tsx` ~line 52): `currentWeek` is computed from `course.start_date` as elapsed-weeks-since-start, clamped to `[1, totalWeeks]`. The header (~line 495) renders `Unit {currentWeek} of {totalWeeks}` from that value.

**New behavior:** the displayed unit advances with the student's progress.
- `lastPassedUnit = max(day)` across `takenQuizzes` where `score > 50` (uses the already-loaded `takenQuizzes` state, which keeps the highest score per day so retakes auto-promote).
- `displayedUnit = clamp(1, totalWeeks, lastPassedUnit + 1)` — i.e. the unit they should tackle next.
- If no quiz has been passed yet, `displayedUnit = 1`.
- If every published unit's quiz has been passed and `lastPassedUnit === totalWeeks`, cap at `totalWeeks` (do not exceed Y).

**Where this label changes (header only):**
- `src/pages/student/StudentHome.tsx` line ~495: replace `Unit {currentWeek} of {totalWeeks}` with `Unit {displayedUnit} of {totalWeeks}` using a new derived `displayedUnit` constant computed alongside `progressPct` (after `takenQuizzes` state is declared).

**Out of scope / unchanged:**
- The progress bar formula (passed quizzes ÷ published quizzes) stays as-is.
- `currentWeek` keeps its calendar definition because other surfaces still rely on it: Lesson Plan "Current" badge, default `expandedWeeks`, "What to Do Next" rules, exam-week detection, and the "not yet published" fallback text. Those are not touched.
- No new queries, no schema changes.
