# Make teacher Course Dashboard progress bar date-based

Replace the hardcoded `currentWeek = 6 / totalWeeks = 16` mock on `/teacher/courses/dashboard` with the same date-based formula already used on `/student/home`, sourced from the `courses` row.

## Change

**`src/pages/teacher/CourseDashboard.tsx`**

1. Add `start_date` and `total_weeks` to the existing `courses` fetch (the file already loads `currentCourse` — extend that select, or add a small effect if it doesn't pull those fields today).
2. Replace lines 132–135:

   ```ts
   // Semester progress (mock)
   const totalWeeks = 16;
   const currentWeek = 6;
   const progressPct = Math.round((currentWeek / totalWeeks) * 100);
   ```

   with the same logic as `StudentHome.tsx` (lines 49–55):

   ```ts
   const totalWeeks = currentCourse?.total_weeks ?? 16;
   const currentWeek = currentCourse?.start_date
     ? Math.max(1, Math.min(totalWeeks,
         Math.floor((Date.now() - new Date(currentCourse.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1))
     : 1;
   const progressPct = Math.round((currentWeek / totalWeeks) * 100);
   ```

3. Update the surrounding label area (around line 214) so the subtext shows `Week {currentWeek} of {totalWeeks}` — mirrors the student view.

## Edge cases

- **No `start_date` set** (course not yet scheduled): fall back to `currentWeek = 1`, `progressPct = round(1/totalWeeks*100)`, and render the subtext as "Start date not set" so the teacher knows why the bar is near-empty.
- **Course past final week**: `Math.min(totalWeeks, …)` already caps it at 100%.
- **`total_weeks` null**: default to 16 (matches student fallback).

## Out of scope

- No class-average mastery bar (separate request).
- No DB changes — `courses.start_date` and `courses.total_weeks` already exist.
- No change to the student view.
