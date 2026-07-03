## Changes to `src/components/admin/StudentProfileDialog.tsx`

1. **Rename label**: "Mastery level" (line 468, in the course overview) → **"Final mastery level"**.

2. **Add "Starting mastery level" insight** per course:
   - In `loadDetails`, add a query on `diagnostic_results` for the student's `learner_level` + `mastery_score` per course (earliest row by `created_at`).
   - Add `startingMasteryLevel` and `startingMasteryScore` to `CourseDetail`.
   - Render a new pill next to "Final mastery level" in the overview header showing the starting level badge (reusing `masteryClass`) and score. If no diagnostic exists → show "—".

3. **Hide empty time stats** in the expanded engagement panel (lines 549–550):
   - Only render "Total assessment time" when `totalAssessmentTimeSec > 0`.
   - Only render "Avg time / question" when `avgTimePerQuestionSec != null && > 0`.
   - No placeholders left behind (removed from the grid entirely when empty).

No schema, edge function, or backend changes. UI-only + one extra read.