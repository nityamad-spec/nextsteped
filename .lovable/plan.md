## Goal
Confirm that restoring an archived mock test in `ExamMode` works correctly across all edge cases, with no regressions to the student-facing exam rotation.

## Current state (from DB)
Course `42e995c8…` has:
- Active: Final 2, Final 3
- Archived: Final 1, Final 2, Final 4

This is the perfect course for exhaustive testing — it covers the no-conflict path AND the label-collision rename path in `useCourseExams.restoreExam`.

## Test matrix

| # | Action | Expected DB result | Expected UI |
|---|--------|-------------------|-------------|
| 1 | Restore archived **Final 1** (no active Final 1) | `archived_at=null`, label stays `Final 1` | Card moves from Archived → Active section, label unchanged, toast "Restored" |
| 2 | Restore archived **Final 2** (active Final 2 exists) | `archived_at=null`, label renamed to `Final 1` (next free, since 2 & 3 active) | Moves to Active, badge shows new label, toast mentions rename |
| 3 | Restore archived **Final 4** | `archived_at=null`, label stays `Final 4` | Moves to Active |
| 4 | Re-archive a restored exam | `archived_at` repopulated; moves back to Archived list; question count preserved | Card returns to Archived section with original question count |
| 5 | Student rotation check after restore (#1) | `loadAvailableExamIds` in `AIChat.tsx` includes the restored exam_id | Restored exam appears in student exam pool |
| 6 | Question bank visibility (Assessments.tsx) | "Archived exam" badge removed from that exam's questions when "Show archived" is off | Questions reappear in default view |

## Execution

1. **Playwright script** at `/tmp/browser/restore-test/` that:
   - Restores session for `teacher.nextstep@gmail.com`
   - Navigates to `/teacher/setup/exam-mode`
   - Screenshots Archived section baseline
   - Clicks **Restore** on Final 1 → waits for toast → screenshots
   - Reads DB to confirm `archived_at IS NULL` and label
   - Clicks **Restore** on Final 2 → confirms rename toast + DB label change
   - Clicks **Restore** on Final 4 → confirms
   - Re-archives one (via the archive button) and confirms it returns to Archived
2. **DB verification** after each step via `supabase--read_query` on `course_exams` filtered to that course.
3. **Cross-page check**: navigate to `/teacher/setup/assessments` and verify "Archived exam" badges disappear for the restored exam's questions.

## Out of scope
- Restoring exams whose questions were never generated (already covered separately).
- Modifying restore logic — this is verification only. Any defects found will be reported with reproduction steps before a fix plan.

## Deliverable
A short report with: pass/fail per row above, screenshots at key steps, and DB before/after snapshots. If any case fails, I'll follow up with a targeted fix plan rather than patching in this turn.
