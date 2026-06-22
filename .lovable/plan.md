## Goal
Fix `/admin/students` so each student appears once (keyed by email) and shows every course they're enrolled in with per-course mastery level and join date — instead of only the most recent enrollment.

## Changes (single file: `src/pages/admin/AdminStudents.tsx`)

1. **Fetch all enrollments, not just one per student.**
   - Query `enrollments` with `student_id, course_id, enrolled_at` for all student profiles (no implicit dedupe).
   - Resolve course names from `courses` as today.
   - Fetch `student_course_mastery` (`student_id, course_id, learner_level`) for the same `(student_id, course_id)` pairs to get per-course mastery (the profile-level `learner_level` is a single value and can't represent per-course mastery).

2. **Group by email.**
   - Build a map keyed by lowercased email. If two profile rows share an email (edge case), merge their enrollments under one row. Display: name + roll number from the most recently created profile; fall back to profile id as key when email is null.
   - Each grouped row carries `courses: Array<{ courseId, name, mastery, enrolledAt }>` sorted by `enrolledAt` desc.

3. **Table layout.**
   - Columns: Name, Email, Roll Number, Courses (count badge + expandable list), Joined (earliest enrollment or profile created_at).
   - Replace the single "Course" + "Level" cells with one "Courses" cell rendering a stacked list: `Course name — <mastery badge> — joined date`. Keep it compact; wrap in a small `<div className="space-y-1">`.
   - Remove the top-level `Level` column (mastery is now per-course).

4. **Delete action.**
   - Still deletes a single auth user. When a grouped row maps to one profile id, behavior is unchanged. If multiple profile ids share an email, disable delete on that row and show a tooltip "Multiple accounts share this email — resolve in DB" to avoid deleting the wrong account.

## Risks / things to flag
- **Memory rule conflict:** project memory says mastery level is "stored in backend but NEVER shown to students/professors." Admin view is not students/professors, so showing it here is consistent — confirming you want it visible to admins.
- **Email collisions:** the schema does not enforce unique email on `profiles`. Grouping by email merges any duplicates into one visible row; the delete affordance is gated as described above. If you'd rather keep one row per profile id (and just list all courses for that profile), say so.
- **Missing mastery rows:** `student_course_mastery` may have no row for a freshly-enrolled student. Those courses will show "—" for mastery.
- **Payload size:** fetching all enrollments + mastery for every student is fine at current scale (admin-only page, small N) but will grow linearly. No pagination is added in this pass.
- **No schema changes, no RLS changes, no edge-function changes.**

## Questions
1. Group strictly by email even when emails collide across profile ids (merge), or keep one row per profile id and just expand its course list? Default: merge by email.
2. Show mastery as the per-course `student_course_mastery.learner_level`, or compute/show something else (e.g., `mastery_score` %)? Default: `learner_level` badge to match current UI.