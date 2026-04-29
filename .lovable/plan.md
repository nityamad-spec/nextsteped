## Goal

Add a per-row "Transfer ownership" action on `/admin/courses` so an admin can reassign `courses.teacher_id` to another teacher, with proper safeguards around collaborators, sessions, and downstream data.

## UX

In `src/pages/admin/AdminCourses.tsx`:

- Add a new "Actions" column to the courses table.
- Each row gets a `…` dropdown menu (`DropdownMenu`) with a "Transfer ownership" item.
- Selecting it opens a `Dialog` with:
  - Course summary (name, code, current owner name + email).
  - Searchable teacher selector (Combobox using `Command`) listing all `profiles` where `role = 'teacher'`, excluding the current owner. Show name + email.
  - Checkbox: "Keep previous owner as collaborator" (default: on).
  - Read-only impact summary: number of enrollments, collaborators, assessments, and lesson plan weeks (fetched on dialog open).
  - Confirm + Cancel buttons. Confirm disabled until a new teacher is selected.
- On success: toast, close dialog, refresh the row's `teacher_name`.

## Backend — new edge function `transfer-course-ownership`

Path: `supabase/functions/transfer-course-ownership/index.ts`

Inputs (validated with Zod):
- `course_id: uuid`
- `new_teacher_id: uuid`
- `keep_previous_as_collaborator: boolean` (default true)

Behavior (service-role client; admin-only):
1. Verify caller via JWT and confirm `is_admin(auth.uid())` — else 403.
2. Load course; 404 if missing. Capture `previous_teacher_id`.
3. Validate `new_teacher_id`:
   - Exists in `profiles` with `role = 'teacher'`.
   - Not equal to current `teacher_id` (else 400 "already owner").
4. In sequence (no transactions across PostgREST, so do best-effort + rollback on failure):
   - `UPDATE courses SET teacher_id = new_teacher_id, updated_at = now() WHERE id = course_id`.
   - Remove any `course_teachers` row for `new_teacher_id` on this course (avoid duplicate/conflict with their new owner status).
   - If `keep_previous_as_collaborator`: upsert `course_teachers (course_id, teacher_id=previous, role='collaborator')`. Otherwise leave existing collaborator row untouched (do not auto-remove — admin can do that separately).
   - Bump cache: `bump_cache_version('course', course_id)` so clients refresh.
5. Return `{ ok: true, course_id, previous_teacher_id, new_teacher_id }`.
6. On any step error after the `courses` update, attempt to revert `teacher_id` back to `previous_teacher_id` and return 500 with the original error.

Auth/CORS: standard pattern used by other functions in `supabase/functions/*` (manual CORS headers, JWT validation against `SUPABASE_JWKS`).

`supabase/config.toml`: no entry needed (default `verify_jwt = false`, validated in code).

## Why an edge function (not direct client UPDATE)

- RLS on `courses` lets admins update, but we also need to (optionally) write `course_teachers` and bump cache atomically with admin privileges, regardless of which RLS policies apply to the new owner.
- Centralizes validation (teacher role check, self-transfer check) and keeps a single audit point if we add logging later.

## Data dependencies (verified, no schema changes needed)

`courses.teacher_id` has no FK, so the update itself won't cascade. Tables that reference the owner indirectly:
- `course_teachers` — handled above.
- `course_ta_settings`, `concepts`, `assessment_questions`, `lesson_plan_weeks`, `enrollments`, `course_material_files`, `diagnostic_questions`, `diagnostic_results`, `assessment_results`, `student_feedback` — all keyed by `course_id`, not `teacher_id`. Access is governed by `is_course_member(course_id, auth.uid())`, which already reads from `courses.teacher_id` and `course_teachers`, so the new owner gains access automatically and the previous owner loses owner-level access (retains access only if kept as collaborator). No data migration required.
- `assessment_questions.teacher_id` and `diagnostic_questions.teacher_id` — these mark *who authored* the question, not ownership. Leave as-is (historical authorship). RLS already permits course members to manage them via `is_course_member`.
- `teacher_setup_progress.teacher_id` — per-teacher onboarding state. Leave as-is; new owner will have their own progress (or none) and can resume setup if needed.
- `chat_sessions` — owned by users; not transferred.

## Files

- `src/pages/admin/AdminCourses.tsx` — add Actions column, dropdown, transfer dialog, teacher search, impact summary, invoke edge function, refresh state.
- `supabase/functions/transfer-course-ownership/index.ts` — new function.

## Risks / non-goals

- Not implementing a generic "delete user" cascade here — this action only handles transfer. Once transfer-ownership exists, a future delete-user flow can require transfer first.
- No audit log table yet; if desired later, add `course_ownership_transfers` table + insert in the function.
- Concurrent edits by the previous owner during transfer: low risk, last write wins; previous owner loses write access immediately after the `courses` update.
