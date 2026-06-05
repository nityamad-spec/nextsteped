
## Goal

Make the teacher's per-week hide toggle authoritative for students, while keeping the date-based auto-reveal for future weeks.

## Root cause (recap)

`lesson_plan_weeks` RLS policy combines the two visibility conditions with **OR**:
- `locked = false`, OR
- date-based reveal (`week_number <= elapsed weeks since course.start_date`)

So a teacher-hidden week (`locked=true`) is still returned to students whose course is past that week. `locked` is overloaded — it means both "auto-locked future week" (set at publish) and "teacher manually hid" (set by toggle).

## Fix (single source of truth: `locked` = teacher's hide flag, dates handle auto-reveal)

### 1. Migration — change RLS to AND, stop auto-locking future weeks

- Drop and recreate `Students read visible lesson_plan_weeks` so the date clause is an additional gate, not an alternative:
  ```
  enrolled in course
  AND locked = false
  AND (
    courses.start_date IS NULL
    OR week_number <= GREATEST(1, LEAST(COALESCE(total_weeks,16), elapsed_weeks))
  )
  ```
- Backfill existing rows: `UPDATE lesson_plan_weeks SET locked = false`. This is safe because (a) date gating now hides future weeks on its own, and (b) the teacher hide flag is currently broken so any "hidden" rows were already visible to students. Teachers who want a specific past week hidden can re-toggle it.

### 2. Frontend — publish/generation stops setting `locked=true` for future weeks

`src/pages/teacher/CourseCreation.tsx`:
- Line 463 (`runGeneration`): change `locked: i > 0` → `locked: false`.
- Line 573 (`addWeek`): change `locked: true` → `locked: false`.
- `toggleLock` (542) and `setWeekLocked` keep their current behavior — `locked=true` now exclusively means "teacher hid this", and RLS honors it.

### 3. UI labelling

`toggleLock` toast already says "Hidden from students / Now visible to students" — no change. The lock icon in the week row continues to reflect `locked` which now matches student visibility 1:1 (modulo date gating for un-started weeks).

### 4. No student-side code change required

`StudentHome.tsx:110–114` and `AIChat.tsx:327` already query `lesson_plan_weeks` and trust RLS. Once the policy is fixed, hidden weeks simply stop appearing.

## Verification

After migration + frontend edits:
1. Teacher hides week 2 on a course whose start_date is 4 weeks in the past — student `SELECT` on `lesson_plan_weeks` returns weeks 1, 3, 4 only.
2. Teacher republishes a fresh plan — all rows land with `locked=false`; students see only weeks up to the elapsed count; future weeks remain hidden via the date clause.
3. Teacher hides a future week (week 10) — already hidden by date; toggling has no visible effect for students, which is correct.
4. Spot-check `AIChat` exam-prep mode: it can no longer quiz on teacher-hidden weeks.

## Files touched

- New migration on `public.lesson_plan_weeks` (RLS policy replace + one-time `UPDATE`).
- `src/pages/teacher/CourseCreation.tsx` — two literal flips (`locked: i > 0` → `false`, `locked: true` → `false` in `addWeek`).

No changes to `lessonPlanWeeks.ts`, no student-side changes, no schema additions.
