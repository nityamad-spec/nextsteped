## Drive Course Progress bar from passed weekly quizzes (score > 50%)

**Current behavior** (`src/pages/student/StudentHome.tsx` lines 49–55): `progressPct` is computed from elapsed time only — `currentWeek / totalWeeks` — so the bar advances on the calendar regardless of student activity. `currentWeek` is also used by the Lesson Plan badge, "What to Do Next" rules, and the "Unit X of Y" header text; those keep using the calendar value. Only the progress bar changes.

**New behavior:** progress = weekly quizzes the student has *passed* (score > 50%) ÷ weekly quizzes the professor has published.

- "Passed" = `takenQuizzes[day].score > 50`. Exactly 50 does not count as passed. Already-loaded `takenQuizzes` state (lines 130–154) keeps the highest score per day, so retakes auto-update.
- Numerator: count of entries in `takenQuizzes` whose `score > 50`.
- Denominator: `availableQuizDays.size` (already loaded, lines 157–171).
- Formula: `progressPct = denom > 0 ? clamp(round(passed / denom * 100), 0, 100) : 0`.
- Caption under the bar:
  - `denom === 0` → "No quizzes published yet"
  - otherwise → `{passed} of {denom} weekly quizzes passed (>50%)`

**Implementation scope (UI only, one file):**
- `src/pages/student/StudentHome.tsx`: replace the `progressPct` calculation (~line 55) with the passed-quiz formula derived from existing `takenQuizzes` and `availableQuizDays` state. Update the caption under `<Progress>` (~line 491). Leave `currentWeek`, `totalWeeks`, and the "Unit {currentWeek} of {totalWeeks}" header text unchanged.

**Out of scope:** No new queries, no schema changes, no changes to "What to Do Next", Lesson Plan rows, exam tracking, or mastery logic. Practice exams are not counted toward this bar.
