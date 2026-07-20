# Suspend student accounts (admin)

Add a reversible "suspend" action so an admin can revoke a student's platform access without deleting any of their data.

## Behavior

- Admin can suspend a student from `/admin/students` (row action + inside the student profile dialog).
- Suspended students:
  - Cannot sign in (edge function rejects with a friendly "Account suspended — contact your administrator" message).
  - Any existing session is revoked immediately on suspension, so they are booted on next request.
- Admin can reactivate at any time, restoring access. All existing data (enrollments, mastery, chats, results) is untouched.
- Suspended students are visually flagged in the admin list (badge) and can be filtered.

## Data model

New column on `public.profiles`:
- `suspended_at timestamptz null` — null = active, non-null = suspended (also serves as the timestamp).
- Optional `suspended_by uuid null references auth.users(id)` for audit.

No RLS change needed for the column itself (admins already read/update profiles). Students continue to read their own profile; the suspension is enforced at sign-in, not by hiding the profile.

## Backend

New edge function `admin-set-student-suspension` (service role):
1. Verify caller is admin (same pattern as `delete-user`).
2. Validate `user_id` + `suspended: boolean`.
3. Update `profiles.suspended_at` / `suspended_by`.
4. When suspending, call `auth.admin.signOut(user_id, 'global')` to invalidate active sessions.
5. Return `{ ok, suspended_at }`.

Update `supabase/functions/student-signin/index.ts`:
- After password verification, look up `profiles.suspended_at` for the user.
- If non-null, do NOT return a session; respond `403 { error: "Account suspended. Contact your administrator." }`.

Non-student sign-in path (regular `supabase.auth.signInWithPassword` in `AuthContext`) is untouched — this only targets students, matching the request.

## Frontend

`src/pages/admin/AdminStudents.tsx`:
- Fetch `suspended_at` alongside existing profile fields.
- Add a "Suspended" badge in the row when set.
- Row dropdown menu: add "Suspend access" / "Reactivate access" toggle with a confirm dialog.
- Add a filter chip "Status: Active / Suspended".

`src/components/admin/StudentProfileDialog.tsx`:
- Show current status and a Suspend/Reactivate button (same confirm flow).

Both call the new edge function and refresh the list on success via existing toast + refetch pattern.

## Out of scope

- No change to teacher accounts.
- No deletion of any student data.
- No email notification to the student.

## Technical notes

- Migration adds the column with default null and grants nothing new (admins already have update rights via existing policies; verify the current UPDATE policy on `profiles` covers admin updates — if not, add an admin-only policy using `public.is_admin(auth.uid())`).
- Session revocation uses `supabaseAdmin.auth.admin.signOut(userId, 'global')`; if any active refresh token races through, the next `student-signin` call will still reject due to the `suspended_at` check.
- `RoleGuard` doesn't need changes: on next navigation the revoked session forces re-auth, and re-auth is blocked.
