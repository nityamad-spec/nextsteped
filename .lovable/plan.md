
The user wants:
1. Auth bypass — already done (`AUTH_BYPASS = true` in `src/App.tsx`). Need to verify it covers all redirects properly.
2. Admin full RLS access to all DB queries/data.

Looking at RLS policies — admins already have policies on most tables (admin_settings, assessment_questions, assessment_results, branches, chat_messages, chat_sessions, concepts, course_material_files, course_ta_settings, course_teachers, courses, degrees, diagnostic_questions, diagnostic_results, enrollments, profiles, signin_attempts, signup_attempts, student_feedback, teacher_applications, universities).

Gaps I noticed:
- `cache_versions` — no admin policy (only authenticated SELECT). Minor.
- `assessment_results` — admin only has SELECT, no UPDATE/DELETE. Same for `diagnostic_results`, `enrollments`, `signin_attempts`, `signup_attempts`, `student_feedback`, `profiles` (no DELETE).
- `course_material_files` — admin only has SELECT, no manage.
- `teacher_applications` — admin has ALL but no WITH CHECK clause.
- `courses` — admin has SELECT + UPDATE but no INSERT/DELETE.

But the bigger blocker for admin testing: **with auth bypassed, there is no `auth.uid()`**. Every RLS policy keys off `auth.uid()` matching admin. So even a perfect admin policy returns false when not logged in. The bypass means RLS will block all reads from the client.

Two practical paths:
- **A)** Keep RLS strict, but actually log in as the seeded admin (`admin@nextstep.ai` / `admin@3465`) so `auth.uid()` resolves and existing admin policies kick in. Then auth bypass is just for navigating UI without re-login between role swaps.
- **B)** Add temporary `anon` SELECT policies on every table for testing. Risky — leaks data publicly on the preview URL.

Recommendation: **A** + fill in the small admin policy gaps so admin truly has full ALL access on every table. Then keep the existing `AUTH_BYPASS` for route navigation. I'll also auto-sign-in the seeded admin when bypass is on, so `auth.uid()` is always populated for DB queries.

## Plan

**1. Auto-login as admin when bypass is on** (`src/contexts/AuthContext.tsx`)
- On provider mount, if `AUTH_BYPASS` and no session, call `supabase.auth.signInWithPassword({ email: "admin@nextstep.ai", password: "admin@3465" })`. Falls back to invoking `seed-admin` edge function first if login fails (admin not yet created).
- Export `AUTH_BYPASS` from a shared constant file (`src/lib/authBypass.ts`) so both `App.tsx` and `AuthContext.tsx` use the same flag.

**2. Fill RLS gaps so admin truly has ALL on everything** (one migration)
- `courses`: add admin INSERT + DELETE policies (currently only SELECT + UPDATE).
- `course_material_files`: add admin ALL policy (currently only SELECT).
- `assessment_results`, `diagnostic_results`, `enrollments`, `student_feedback`, `signin_attempts`, `signup_attempts`: add admin UPDATE + DELETE policies.
- `profiles`: add admin DELETE policy.
- `cache_versions`: add admin ALL policy.
- `teacher_applications`: add WITH CHECK clause to existing ALL policy.
- All use the existing `is_admin(auth.uid())` security-definer function (no recursion risk).

**3. Verify `ProtectedRoute` bypass already in place**
- Already done in last turn. No changes needed there.

## Revert path
Set `AUTH_BYPASS = false` in `src/lib/authBypass.ts`. The expanded admin RLS policies are safe to keep permanently — they only grant access to verified admins via `is_admin()`.

## Files to touch
- `src/lib/authBypass.ts` (new — single source of truth for the flag)
- `src/App.tsx` (import flag from new file)
- `src/contexts/AuthContext.tsx` (auto-signin as admin when bypass active)
- New migration: admin RLS policies on the tables listed above.
