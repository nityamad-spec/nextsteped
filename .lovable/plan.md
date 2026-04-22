

## Wipe-all-courses edge function + admin trigger

### Goal

Give admins a one-click "Reset all course data" action that deletes every course in the database along with all dependent rows and storage files, leaving teacher/admin/student accounts untouched. Net result: a clean slate where teachers can run setup again from scratch.

### Part 1 — New edge function: `wipe-courses`

Path: `supabase/functions/wipe-courses/index.ts`

Behavior (admin-only, `verify_jwt = false` in code with manual JWT check via service role):

1. Validate the caller is an admin: read JWT from `Authorization` header, look up `profiles.role === 'admin'`. Reject with 403 otherwise.
2. Use the service role client to delete in dependency order (no FK cascades exist in the schema, so we delete explicitly):
   - `assessment_results`
   - `assessment_questions`
   - `diagnostic_results`
   - `diagnostic_questions`
   - `concepts`
   - `course_ta_settings`
   - `course_material_files`
   - `course_teachers`
   - `enrollments`
   - `chat_messages` (via `chat_sessions.course_id`) then `chat_sessions` where `course_id IS NOT NULL`
   - `student_feedback` where `course_id IS NOT NULL`
   - `cache_versions` where `scope = 'course'`
   - `teacher_setup_progress` (so re-setup starts fresh)
   - `courses` (last)
3. Wipe storage bucket `course-materials`: list all objects recursively (paginated, 1000 at a time) and `storage.remove(paths)`. This catches every PDF, every `approved-syllabus.json`, every `published-plan.json`, every `lesson-plan-draft-v2.json`, etc.
4. Also clear `teacher_applications.assigned_course_id` (set to NULL) so previously-approved apps don't dangle pointing to deleted courses. Keep the application rows themselves.
5. Return a summary: `{ ok: true, deleted: { courses: N, files: M, ...per-table counts } }`.

What is **NOT** deleted:
- `profiles` (teachers, students, admins)
- `auth.users`
- `teacher_applications` rows (only `assigned_course_id` is nulled)
- `admin_settings`, `degrees`, `branches`, `universities`, `signin_attempts`, `signup_attempts`

### Part 2 — Admin Dashboard UI

In `src/pages/admin/AdminDashboard.tsx`, add a **Danger Zone** card at the bottom of the existing **Settings** tab.

UI:
- Red-bordered `Card` titled "Danger Zone — Reset all course data"
- Description listing exactly what gets wiped (courses, materials, concepts, lesson plans, diagnostic & assessment questions, results, enrollments, course chats, TA settings, uploaded files in storage) and what is preserved (user accounts, teacher applications, admin settings).
- Destructive `Button` "Wipe all courses" → opens an `AlertDialog` requiring the admin to type the word `WIPE` into an `Input` to enable the confirm button.
- On confirm: `supabase.functions.invoke("wipe-courses")`, show loading spinner, then toast the per-table summary returned by the function and call `fetchData()` to refresh the dashboard.

### Files touched

| File | Change |
|---|---|
| `supabase/functions/wipe-courses/index.ts` | New — admin-gated mass delete + storage purge |
| `src/pages/admin/AdminDashboard.tsx` | Add Danger Zone card in Settings tab + confirmation dialog with type-to-confirm |

### Out of scope

- No schema migration. We are not adding `ON DELETE CASCADE` to existing FKs (would require touching every table). Explicit per-table delete in the edge function is sufficient and auditable.
- Not deleting any user accounts or teacher applications.
- No per-course "delete one course" action — this is intentionally a full reset.
- No undo. The confirmation dialog + type-to-confirm is the only safety net.

