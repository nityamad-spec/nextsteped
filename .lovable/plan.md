# Make course mastery band counts clickable

## Goal

In `src/components/CourseAnalyticsView.tsx`, the Course mastery card shows five tiles (Beginner, Developing, Proficient, Expert, No data). Today only the number is shown. Make each tile clickable so it opens the existing student-roster dialog filtered to students in that band — same UX pattern already used by Diagnostic done/pending, Completed/Not completed, and the weekly-quiz tiles.

## Changes (single file: `src/components/CourseAnalyticsView.tsx`)

1. **Compute per-band student lists in `computeStats`** (around lines 327–429, where `masteryByStudent` and `bands` are built). While iterating `raw.mastery`, also push `toLite(student_id)` into one of five arrays keyed by band. Bucket rule matches the existing counters:
   - `beginner`, `developing`, `proficient`, `expert` — from `learner_level` (case-insensitive), same logic that produces `bands[k]`.
   - `none` — enrolled students with no row in `masteryByStudent` (same fallback used for `bands.none`).
   Return them on the stats object as `masteryStudents: { beginner: StudentLite[]; developing: StudentLite[]; proficient: StudentLite[]; expert: StudentLite[]; none: StudentLite[] }`.

2. **Extend the `RosterView` union** with `"mastery-beginner" | "mastery-developing" | "mastery-proficient" | "mastery-expert" | "mastery-none"`.

3. **Wire clickability in the Course mastery card** (lines 549–560): replace the plain `<div>` tiles with a button-styled variant (reuse the same clickable pattern as the other `Stat` tiles — cursor-pointer, hover state, keyboard-focusable) that calls `setRosterView('mastery-<k>')` when the band's count > 0. Leave zero-count tiles non-interactive, matching current behavior for other tiles. Apply the same treatment to the "No data" tile.

4. **Add dialog entries** to the `cfg` map (around lines 647–655) for the five new views:
   - Titles: `"Beginner mastery"`, `"Developing mastery"`, `"Proficient mastery"`, `"Expert mastery"`, `"No mastery data"`.
   - Lists: `stats.masteryStudents.<band>`.
   - Descriptions: e.g. `"${n} enrolled students are at Beginner mastery."` and for `none`: `"${n} enrolled students have no mastery data yet."`.

No changes to data fetching, RLS, realtime subscriptions, or the mastery bucketing math — this is purely surfacing the student names already reachable from existing `raw.mastery` + `enrolledIds`.

## Notes

- Reuses the existing `Dialog` + `ScrollArea` roster UI, so styling and empty-state behavior stay consistent.
- Applies to both `/admin/courses` (via `CourseProfileDialog`) and `/teacher/analytics` since they share this component. Per project memory mastery levels are visible to students and admins but hidden from professors — however this card is already rendered as-is in the teacher analytics view today, so this change only affects interactivity, not visibility. If you'd like to hide the whole Course mastery card from the teacher route, say so and I'll add that gating in the same change.
