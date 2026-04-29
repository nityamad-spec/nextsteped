# Delete Course Action on /admin/courses

Add a destructive "Delete course" action to the actions dropdown on `/admin/courses`. Removes the course and every dependent row across the schema.

## What gets built

### 1. New edge function: `supabase/functions/delete-course/index.ts`

**Auth**: same pattern as `delete-user` / `wipe-courses` — JWT via `getClaims`, caller must have `profiles.role = 'admin'`.

**Body**: `{ course_id: string }`.

**Deletion order** (mirrors per-course slice of `wipe-courses`, no FK cascades except `pending_signups → courses`):

1. `assessment_results` where `course_id`
2. `assessment_questions` where `course_id`
3. `diagnostic_results` where `course_id`
4. `diagnostic_questions` where `course_id`
5. `concepts` where `course_id`
6. `course_ta_settings` where `course_id`
7. `lesson_plan_weeks` where `course_id`
8. `course_material_files` where `course_id` — also remove associated `course-materials` storage objects
9. `course_teachers` where `course_id`
10. `enrollments` where `course_id`
11. `chat_sessions` where `course_id` (and their `chat_messages`)
12. `student_feedback` where `course_id`
13. `teacher_setup_progress` where `course_id`
14. Null `teacher_applications.assigned_course_id` / `assignment_type` where it points here
15. `pending_signups` where `course_id` (the FK from the earlier wipe-courses bug)
16. `cache_versions` where `scope='course' AND scope_id=course_id`
17. Null `profiles.active_course_id` where it points here
18. `courses` row

Returns `{ ok: true, deleted: { table: count, … } }`.

### 2. UI: `src/pages/admin/AdminCourses.tsx`

- Add **Delete course** (red, `Trash2` icon) below "Transfer ownership" in the existing actions `DropdownMenu`.
- Opens a confirmation `AlertDialog` showing:
  - Course name + code, current owner, and the impact summary already loaded (enrollments, collaborators, assessment questions, lesson plan weeks).
  - Warning that this is irreversible and removes all materials, results, chat history, and feedback.
  - Required confirmation: type the course name to enable the Delete button.
- On confirm, calls `supabase.functions.invoke('delete-course', { body: { course_id } })`, toasts the result, and removes the row from local state.

## Risks & dependencies

- **Irreversible.** Hard delete of all course-scoped student work (results, chat, feedback) and uploaded materials. Typed-name confirmation is the guard.
- **Active users**: anyone currently viewing the course will see errors until they refresh; clearing `profiles.active_course_id` and bumping no longer needed since the row is gone. Their `useEnrolledCourseId` / `useTeacherCourseId` hooks will fall back to another course or "no course" state.
- **Storage**: only objects referenced in `course_material_files.storage_path` are removed. If there are stray uploads not tracked in that table they will remain (consistent with current `wipe-courses` behavior).
- **Pending signups**: deleted (matches the FK constraint that previously broke `wipe-courses`).
- **Teacher applications** that targeted this course are kept but have their assignment cleared.

## Files

- New: `supabase/functions/delete-course/index.ts`
- Edit: `src/pages/admin/AdminCourses.tsx`
