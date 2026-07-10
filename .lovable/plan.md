# Fix: professors can't see their courses (profiles RLS recursion)

## Diagnosis

Every failing request in the network log returns:
`42P17 infinite recursion detected in policy for relation "profiles"`.

That's why the teacher→course mapping (and everything else) fails — `courses`, `course_teachers`, `admin_settings`, `profiles?select=role` all error out.

Root cause is the recent migration that added the policy **"Teachers can view profiles of their enrolled students"** on `public.profiles`:

```
(role = 'student') AND EXISTS (
  SELECT 1 FROM enrollments e
  WHERE e.student_id = profiles.id
    AND is_course_member(e.course_id, auth.uid())
)
```

The subquery on `enrollments` runs under the caller's RLS. `enrollments` has an admin policy that inlines `SELECT ... FROM profiles WHERE role='admin'`, which re-enters `profiles` RLS, which re-evaluates the teacher policy, which re-hits `enrollments` → recursion.

Several existing admin policies have the same inline-`profiles` shape and are latent recursion sources:
- `courses` → "Admins can view all courses", "Admins can update courses"
- `course_teachers` → "Admins can manage all course_teachers"
- `enrollments` → "Admins can view all enrollments"

The already-defined `public.is_admin(uuid)` is `SECURITY DEFINER` and bypasses RLS — the fix is to route through definer functions everywhere instead of inline `profiles` subqueries.

## Plan (RLS-only migration, no app code changes)

1. Add a `SECURITY DEFINER` helper `public.teacher_can_view_student(_student_id uuid, _teacher_id uuid)` that returns true iff an `enrollments` row exists for `_student_id` in a course where `is_course_member(course_id, _teacher_id)`. Runs as definer so it doesn't trigger `enrollments` RLS.
2. Drop and recreate the **"Teachers can view profiles of their enrolled students"** policy on `profiles` to use `teacher_can_view_student(profiles.id, auth.uid())` instead of the inline EXISTS. Scope stays `role = 'student'`.
3. Replace the inline `SELECT FROM profiles WHERE role='admin'` in the admin policies on `courses`, `course_teachers`, and `enrollments` with `public.is_admin(auth.uid())`. Semantics unchanged, no more re-entry into `profiles` RLS.
4. No changes to grants, no changes to non-admin/non-teacher policies, no schema changes.

## Verification (after apply)

- Re-run the earlier professor/collaborator/unrelated-teacher/self matrix against `profiles` — expect the same 8 outcomes as before.
- Confirm `SELECT id FROM courses WHERE teacher_id = <teacher>` and `SELECT course_id FROM course_teachers WHERE teacher_id = <teacher>` return rows for `teacher.nextstep@gmail.com` (currently 500ing).
- Reload `/teacher/courses/dashboard` in the preview signed in as that teacher and confirm the course switcher populates.

## Risks

- **Behavior change in admin policies**: `is_admin()` reads `profiles.role='admin'` with definer rights — same predicate the inline subqueries evaluated, so no functional drift expected. If any admin's profile row is missing, both old and new checks fail identically.
- **Definer helper on enrollments**: `teacher_can_view_student` bypasses `enrollments` RLS by design. It only exposes a boolean and is gated by the outer `profiles` policy (`role='student'` + `auth.uid()` as `_teacher_id`), so it cannot be used to enumerate enrollments.
- **Historical enrollments** still count (no `active` flag on `enrollments`) — same caveat called out previously; unchanged by this fix.
- **Perf**: one EXISTS on `enrollments` per profile row, same as before; wrapped in a definer function so the planner sees a single function call.
- Migration is reversible: drop the helper and restore the previous `EXISTS` policy if needed.
