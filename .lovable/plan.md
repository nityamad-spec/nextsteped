# Delete User (Teacher / Student) from Admin UI

Add a destructive "Delete user" action to both `/admin/teachers` and `/admin/students` tables. Deleting a user must remove the auth account, profile, and all user-owned rows, and must safely handle teachers who own courses.

## What gets built

### 1. New edge function: `delete-user`

Location: `supabase/functions/delete-user/index.ts`

**Auth & validation**
- Requires `Authorization: Bearer` JWT (uses `getClaims` like `wipe-courses`).
- Caller must have `profiles.role = 'admin'`.
- Body: `{ user_id: string, role: 'teacher' | 'student', course_action?: 'block' | 'transfer', transfer_to?: string }`.
- Refuses to delete another admin or self.

**Pre-flight for teachers**
- Looks up `courses` where `teacher_id = user_id`.
- If any exist:
  - `course_action = 'transfer'` + `transfer_to` (validated as another teacher): reassigns each course (same logic as `transfer-course-ownership` — update `teacher_id`, remove conflicting `course_teachers` row for the new owner, optionally insert previous owner as collaborator is N/A here since they're being deleted).
  - `course_action = 'block'` (default): returns `409` with `{ error, owned_courses: [{id, name}] }` so the UI can prompt.

**Deletion order** (no FK cascades in schema, mirrors `wipe-courses`)

For **students** (user_id = student):
1. `assessment_results` where `student_id = uid`
2. `diagnostic_results` where `student_id = uid`
3. `student_feedback` where `student_id = uid`
4. `enrollments` where `student_id = uid`
5. `chat_messages` where `user_id = uid`, then `chat_sessions` where `user_id = uid`
6. `pending_signups` where `lower(email) = lower(profile.email)`
7. `profiles` row
8. `auth.admin.deleteUser(uid)`

For **teachers** (after course transfer or with no courses):
1. `course_teachers` where `teacher_id = uid` (collaborator memberships)
2. `teacher_setup_progress` where `teacher_id = uid`
3. `teacher_applications` where `lower(email) = lower(profile.email)`
4. `course_material_files` where `teacher_id = uid` — also remove storage objects at those `storage_path`s
5. `assessment_questions` where `teacher_id = uid` (orphan questions from this teacher)
6. `diagnostic_questions` where `teacher_id = uid`
7. `chat_messages` / `chat_sessions` where `user_id = uid`
8. `profiles` row
9. `auth.admin.deleteUser(uid)`

After success, `bump_cache_version('global', '00000000-…')` is called to invalidate client caches (best-effort).

Returns `{ ok: true, deleted: { table: count, … } }`.

### 2. UI changes

**`src/pages/admin/AdminTeachers.tsx`**
- Add an "Actions" column with a `DropdownMenu` per row containing **Delete user** (red).
- Clicking opens an `AlertDialog` that:
  - Shows the teacher's name/email and current course/student counts.
  - If `course_count > 0`: shows a `Combobox` to pick a transfer target (other teachers) and a radio between **Transfer ownership then delete** vs **Cancel**. No "delete without transfer" path — orphaned courses are not allowed.
  - Requires typing the teacher's email to confirm.
  - On confirm, calls `supabase.functions.invoke('delete-user', { body: { user_id, role: 'teacher', course_action, transfer_to } })`.
  - Shows toast and removes the row from local state on success.

**`src/pages/admin/AdminStudents.tsx`**
- Same pattern: Actions column → Delete user → AlertDialog with email confirmation → `invoke('delete-user', { body: { user_id, role: 'student' } })`.
- No transfer flow needed.

**Shared niceties**
- Disable the menu trigger while a delete is in flight.
- Surface server error messages via `toast` (especially the 409 "owned_courses" case so the admin sees why it was blocked).

## Risks & dependencies

- **Hard delete is irreversible.** All chat history, results, and uploaded files for that user are gone. Confirmation dialog with typed-email gate.
- **Teacher with courses**: must be transferred first; the function refuses otherwise. Reassigned courses keep all enrollments, assessments, materials intact (only `teacher_id` changes).
- **Storage**: the function removes `course-materials` objects associated with `course_material_files` it deletes; other artifacts (none currently) untouched.
- **Pending signups / teacher applications** are matched by email (case-insensitive) since neither has a `user_id` column.
- **`auth.admin.deleteUser`** requires `SUPABASE_SERVICE_ROLE_KEY` (already configured).
- **Self-protection**: function blocks deleting admins or your own account to prevent lockout.

## Files

- New: `supabase/functions/delete-user/index.ts`
- Edit: `src/pages/admin/AdminTeachers.tsx`
- Edit: `src/pages/admin/AdminStudents.tsx`
