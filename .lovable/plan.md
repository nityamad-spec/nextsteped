# Restore Skill Training Test and lock down destructive resets

## Why it happened

You remembered correctly — the course did have a full four-stage path. The database audit shows exactly what happened:

- At **14:18 UTC today**, on the professor account, the course syllabus file (AI Engineer Bootcamp Syllabus) was deleted from the course materials screen.
- Deleting the last syllabus doesn't just remove that file. It runs a cascade reset that deleted the 6 lesson-plan units, the saved lesson-plan files, the setup progress markers, and set the course back to unpublished.
- Because an unpublished course is hidden from students, it vanished from your student course picker at the same moment the path emptied.
- The Career Readiness modules (3) and Capstone projects (2) were not touched and are still in place. The Resources/Companies work did not cause this.

Why it wasn't flagged: that delete needs no admin approval, sends no notification to you, and its warning lists the data types it wipes but never says the course will be unpublished and hidden from enrolled students.

## 1. Restore the course

- Recreate the 6 technical units: Units 1-3 in Foundations at 8 hours each, Units 4-6 in Advanced Technical at 10 hours each, with AI Engineer subject matter, overviews and concepts matching the original demo structure.
- Restore the published lesson-plan state and publish the course again.
- Keep target role AI Engineer, Career Readiness at 12 hours (3 existing modules), Capstone at 20 hours (2 existing projects).
- Point your student account's active course back to Skill Training Test.
- Verify live in your student view: course appears in the picker, Learning Path shows all four stages with 3 + 3 units, Career Readiness and Capstone intact, Resources shows the 16 companies.

Note: the reset permanently deleted the original unit text, so wording inside each unit is rebuilt rather than recovered. Structure, stages, hours and topics will match what you had.

## 2. Stop this from happening again

- Require typing the course code to confirm before any syllabus delete that triggers a cascade.
- Add an explicit line to the warning: this unpublishes the course and hides it from enrolled students.
- Add an admin approval gate: a professor delete that would cascade is blocked unless an admin has enabled destructive resets for that course, with a clear message telling the professor to request approval.
- Surface a reset history entry in the Admin Portal so every cascade is visible after the fact.

## Technical notes

- Restore is data-only: insert `lesson_plan_weeks` rows, set `courses.lesson_plan_published_at` and `published`, update `profiles.active_course_id` for your student account. No schema change for the restore itself.
- The guard work touches `src/components/FileUploadZone.tsx` (typed confirmation, clearer warning) and `supabase/functions/wipe-syllabus-cascade/index.ts` (server-side approval check, so the block can't be bypassed), plus a small course-level flag column for the admin approval switch and an admin-facing view of `wipe_audit_log`.
