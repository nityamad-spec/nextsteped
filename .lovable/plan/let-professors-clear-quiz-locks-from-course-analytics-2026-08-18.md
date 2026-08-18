# Let professors clear quiz locks from Course Analytics

## Current state (verified)

- Lock status is already persistent in the database: every voided attempt is a row in `assessment_attempt_voids` (`student_id`, `course_id`, `assessment_type` of `weekly_quiz` / `diagnostic` / `exam`, `ref_key` for the week or exam id, `reason`, `created_at`).
- A student is locked out of a specific assessment once they reach 2 voids for that `(course, type, ref_key)` (`VOID_LOCK_THRESHOLD` in `src/lib/attemptVoids.ts`). This is checked live in the diagnostic, weekly quiz and learning path screens, so it holds for every student across every quiz in every course.
- Course teachers and admins can already read and delete these rows (RLS policies exist). Today only the admin student dialog exposes an unlock button; professors have no way to do it.

## What gets built

A new "Proctoring locks" card on the Course Analytics page (shown on the professor's page and inside the admin course dialog, since both render the same view).

The card lists every student in the course who is locked out of at least one assessment, with:

- Name and email
- Which assessments they are locked out of (e.g. "Week 3 quiz, Diagnostic")
- Number of voided attempts and the date of the most recent one
- A checkbox per row plus select-all

A "Allow retake" action clears all locks for the selected students in this course — every assessment they were blocked from. A confirmation step states plainly how many students and how many locks are affected. If no one is locked, the card shows a short "No students are locked out" state instead of an empty table.

Clearing is a forgive, not a wipe: the void rows stay for history and are marked as cleared, so repeat offenders are still visible. The card only counts uncleared voids toward the lock, and each row shows "previously cleared N times" when applicable.

## Technical notes

- Migration on `public.assessment_attempt_voids`: add `cleared_at timestamptz`, `cleared_by uuid`. Add a policy allowing course members and admins to update these two columns; the existing delete policy stays but is no longer used by the app.
- `src/lib/attemptVoids.ts`: all count/fetch helpers filter `cleared_at is null` so a cleared void no longer locks the student. Add `clearVoidsForStudents({ courseId, studentIds })` which stamps `cleared_at = now()` and `cleared_by = auth.uid()`.
- New `src/components/teacher/ProctoringLocksCard.tsx`, rendered from `CourseAnalyticsView`. It loads uncleared voids for the course, groups by student, joins names/emails from `profiles`, and only renders students at or above the lock threshold for at least one assessment.
- Week/exam labels resolve from `lesson_plan_weeks` and `course_exams` where available, falling back to "Week N" / the exam id.
- Update `src/components/admin/StudentProfileDialog.tsx` to use the same clear-instead-of-delete helper so both surfaces behave identically.
- Tests: extend `src/lib/attemptVoids.test.ts` for the cleared-row filtering and the clear helper; add a component test for the card's grouping and multi-select clear.

## Suggested improvements (included unless you say otherwise)

- Forgive-with-history instead of delete, as above — this is the main change from how the admin dialog works today.
- Show void reason and timestamp so professors can distinguish an accidental tab switch from repeated leaves.
- Make the card live-updating with the analytics realtime subscription already on the page, so a new lock appears without a reload.

## Risks

- Clearing all locks in a course is coarse by design: a student unlocked for a genuine reason on Week 3 also regains their diagnostic and exam attempts. A per-assessment picker can be layered on later without changing the data model.
- Showing name and email in this card is a deliberate exception to the anonymised analytics elsewhere on the page; it is required to act on the right student.
