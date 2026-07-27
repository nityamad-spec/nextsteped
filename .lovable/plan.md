## Goal
Add an Achievements card to the right of Concept Mastery on `/student/home`, matching the attached screenshot. All 4 achievements are derived on the fly from data we already have — no new tables.

## Layout
Wrap the Concept Mastery summary card + new Achievements card in a 2-column grid (`md:grid-cols-2`), stacking on mobile. Concept Mastery keeps its current internal design.

Achievements card structure (matches screenshot):
- Header row: medal icon + **Achievements** title, subtitle "Small wins that build momentum", right-aligned pill "N of 4 earned".
- Row of 4 square tiles. Each tile:
  - Rounded soft-tinted square (green tint when earned, muted gray when locked).
  - Emoji/icon centered.
  - Bold label under the tile (muted color when locked, truncates with ellipsis).
  - `Tooltip` on hover/focus showing the criterion + current progress (e.g. "Take weekly quizzes 2 weeks in a row · 1/2 weeks").

Tiles (in order):
1. 🚀 **First Steps** — Complete Unit 1
2. ↗ **Comeback** — Beginner → Expert on the same concept
3. 🔥 **Consistency** — Weekly quiz 2 weeks in a row
4. 🏆 **Concept Master** — Proficient/Expert on every concept

## Earn logic (derived, per-render)

Inputs already available in `StudentHome`: `concepts`, `conceptMastery` (per-concept `{score, attempted, level}`), plus new lookups.

1. **First Steps** — Week 1 quiz submitted **AND** Learning Path opened for Week 1.
   - Quiz: `assessment_results` row with `course_id`, `student_id`, `mode='daily_quiz'`, `week_number=1` exists.
   - Reading: `localStorage.getItem(lpOpenedKey(courseId, isoYearWeekForCourseWeek1))` is set. Reuse existing `lpOpenedKey`/`markLearningPathOpened`.
2. **Comeback** — For any concept, its **first** `student_concept_mastery` row had `level='beginner'` **and** its **current** level is `'expert'`.
   - Query: earliest row per concept via `select concept_id, level, created_at ... order by created_at asc`, group in JS; compare with current `conceptMastery[id].level`.
3. **Consistency** — Student submitted a weekly quiz in the current ISO week **and** the immediately preceding ISO week.
   - Derive from the same `assessment_results` fetch (group `created_at` into ISO-year-week buckets).
4. **Concept Master** — Every concept in `concepts` has current mastery level in `{proficient, expert}` (using `getMasteryLevel`).

Progress strings shown in tooltip:
- First Steps: "Quiz 1: ✓/✗ · Readings: ✓/✗"
- Comeback: "0 concepts promoted from Beginner to Expert" or "Earned via <concept name>"
- Consistency: "N/2 consecutive weeks"
- Concept Master: "N/M concepts at Proficient+"

## Data fetching

New `useAchievements(courseId, studentId, concepts, conceptMastery)` hook in `src/hooks/useAchievements.ts`:
- One `assessment_results` query: `select week_number, created_at where course_id=? and student_id=? and mode='daily_quiz'`.
- One `student_concept_mastery` query for earliest-per-concept baseline: `select concept_id, level, created_at order by created_at asc`.
- Both cached via React Query (5 min stale) alongside existing student home queries.
- Returns `{ achievements: Achievement[], earnedCount }`.

`Achievement` shape: `{ id, label, emoji, earned, tooltip }`.

## Files
- `src/hooks/useAchievements.ts` — new; queries + derivation.
- `src/components/student/AchievementsCard.tsx` — new; presentational card + tiles + tooltips.
- `src/pages/student/StudentHome.tsx` — wrap current Concept Mastery card and `<AchievementsCard />` in a 2-col grid; pass `concepts`, `conceptMastery`, `courseId`, `studentId`.

## Risks / notes
- **First Steps readings signal** relies on `localStorage`; a student on a new device shows unearned even if they read before. Acceptable per prior convention (Reading card uses same signal).
- **Comeback baseline** requires `student_concept_mastery` to have historical rows; if a student's first row was recorded at a level higher than `beginner` (e.g. jumped straight to developing on first quiz), they can never earn it. Consistent with the user's stated definition.
- **Consistency** is strict "consecutive ISO weeks", not "any 2 weeks". Confirming this matches intent — if not, easy to relax.
- No database changes, no new RLS.
