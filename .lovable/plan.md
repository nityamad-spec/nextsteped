## Goal
In the Course Profile dialog's **Assessment activity → Weekly quizzes** box, replace the single "Students attempted" line with three clickable breakdowns based on how many distinct weekly quizzes each enrolled student has submitted.

## Source of truth
- Quiz universe = `stats.quizzesTotal` (distinct `quiz_day` values seen in `assessment_results` for `mode='daily_quiz'`, scoped to this course). The label uses this number dynamically — e.g. "Completed all 14" when `quizzesTotal === 14`.
- Per-student progress = size of the existing `quizByStudent` Map (already built in the stats memo). Respects the active university filter via `enrolledIds`.

## Changes — `src/components/admin/CourseProfileDialog.tsx`

1. **Stats memo**
   - For each enrolled student id, compute `done = quizByStudent.get(sid)?.size ?? 0`.
   - Build three lists (`StudentLite` augmented with `quizzesDone` for the partial list):
     - `quizCompletedAll`: `done === quizzesTotal && quizzesTotal > 0`
     - `quizPartial`: `done >= 1 && done < quizzesTotal` — each entry carries `done` and `remaining = quizzesTotal - done`
     - `quizNotStarted`: `done === 0`
   - Sort each list with the existing `sortLite`.
   - Edge case: if `quizzesTotal === 0`, treat everyone as "Not started" and show 0 / 0 / enrolled (labels still render, "Completed all 0" hidden — see UI below).

2. **UI — Weekly quizzes card**
   - Replace the single "Students attempted" row with three lines, each a clickable `Stat`-style button (text-only, matches existing density):
     - `Completed all {quizzesTotal}: N`
     - `Partially done (1–{quizzesTotal - 1}): M`
     - `Not started (0): K`
   - When `quizzesTotal === 0`, hide the first two lines and only show "Not started (0)" disabled.
   - Keep `Total attempts` and `Avg score` lines unchanged below.

3. **Sub-dialog (roster)**
   - Extend the existing `rosterView` discriminator with three new modes: `"quiz-completed" | "quiz-partial" | "quiz-not-started"`.
   - Reuse the same dialog component already used for diagnostic/completion lists.
   - For `quiz-partial`, render each row with an extra muted suffix showing remaining count, e.g. `"3 of 14 done · 11 left"`.
   - For the other two modes, render the standard name + email rows.
   - Titles/descriptions follow the existing pattern (e.g. "Completed all weekly quizzes — {course.name}").

## Out of scope
- No backend/schema changes.
- No change to `quizzesTotal` derivation.
- No change to Total attempts / Avg score calculations.
- Exams card stays untouched.
