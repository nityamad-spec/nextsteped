## Goal
On `/admin/courses` course profile dialog, make the Course Completion stat show both **Completed** and **Not completed** counts, each clickable to reveal a list of student names + emails (mirroring the diagnostic done/pending pattern).

## Changes (single file: `src/components/admin/CourseProfileDialog.tsx`)

1. **Stats memo**
   - Already computes `completedCount` (students who submitted all published weekly quizzes AND all active exams, filtered by selected university).
   - Add two derived arrays using the same eligibility rule (enrolled + matching university filter):
     - `completedStudents: { name, email }[]`
     - `notCompletedStudents: { name, email }[]` (enrolled students not in the completed set)
   - Add `notCompletedCount = enrolledFiltered - completedCount`.

2. **UI**
   - Replace the single "Course completion" stat tile with a 2-up layout (or two adjacent `Stat` buttons) within the existing completion section:
     - "Completed" → opens sub-dialog with `completedStudents`
     - "Not completed" → opens sub-dialog with `notCompletedStudents`
   - Reuse the existing student-list sub-dialog component already built for diagnostic done/pending; extend its state to accept a title + list for completion too (single dialog, switched by a `mode` discriminator like `'diag-done' | 'diag-pending' | 'completed' | 'not-completed'`).

3. **Behavior**
   - Both lists respect the active university filter, identical to diagnostic stats.
   - Sort lists alphabetically by name (fallback to email).
   - Empty states: show "No students" inside the sub-dialog when list is empty.

## Out of scope
- No schema changes, no backend changes, no changes to the completion definition itself.
