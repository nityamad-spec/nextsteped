## Root cause

The `teacher_applications` table has two RLS policies:

- `Admins can manage teacher applications` — ALL, role `authenticated`, check `is_admin(auth.uid())`
- `Anon can submit teacher application` — INSERT, role `anon` only, check `true`

The submit form (`TeacherApplicationForm.tsx`) inserts into `teacher_applications`. If the visitor is signed in as **any authenticated non-admin user** (e.g. a previously-approved teacher, or a student who navigated to `/intro/teacher/apply`, or someone who never logged out after an earlier flow), their JWT role is `authenticated`, not `anon`. The anon-only INSERT policy doesn't apply, the admin policy's `WITH CHECK` fails (`is_admin` is false), and Postgres returns the RLS violation shown in the screenshot.

This matches the reported symptom: approved teachers submitting/retrying the application form hit the error because they are signed in.

## Fix

Add an INSERT policy that also permits authenticated users to insert their own application row. Keep it permissive on payload (matches existing anon behavior) since the row is admin-reviewed before it grants any privilege.

### Migration

```sql
CREATE POLICY "Authenticated can submit teacher application"
ON public.teacher_applications
FOR INSERT
TO authenticated
WITH CHECK (true);
```

No changes to grants (authenticated already has table privileges via existing admin policy grants — verified by the admin ALL policy working). No changes to the anon policy, admin policy, or any application code.

### Out of scope

- No change to approval flow, edge functions, or client code.
- No change to SELECT/UPDATE/DELETE policies.
- Not tightening the WITH CHECK (e.g. to `email = auth.jwt()->>'email'`) — current anon policy is `true`, so keeping parity avoids breaking legitimate cases where the signed-in user applies with a different institutional email.

## Files touched

- New migration: add INSERT policy for `authenticated` on `public.teacher_applications`.
