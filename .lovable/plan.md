# Fix: Admin & teacher views empty after security migration

## Root cause

The previous hardening migration ran `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` on every `SECURITY DEFINER` helper. That was correct for trigger-only functions, but four of those helpers are actually called **from RLS policy expressions** or **directly from the client via `supabase.rpc(...)`**. Without `EXECUTE`, the policy bodies silently evaluate to false for the calling role, so:

- Admin pages (`/admin/students`, `/admin/teachers`, `/admin/courses`) return zero rows — every admin SELECT policy is gated by `is_admin(auth.uid())`.
- Teacher collaborator views (courses, concepts, assessment_questions, TA settings, etc.) return zero rows — those policies call `is_course_member(course_id, auth.uid())`.
- `CourseDashboard` shows no stats — it calls `rpc("course_dashboard_stats", ...)` directly.
- Cache busting after edits fails — `src/lib/cacheVersion.ts` calls `rpc("bump_cache_version", ...)`.

## Fix

Single migration that re-grants `EXECUTE` on only the four functions that need it. Trigger-only validators (`assessment_questions_validate_topic`, `diagnostic_questions_validate_topic`, `set_created_at_if_null`, `update_updated_at_column`) stay revoked — they run as the trigger owner and don't need role-level execute.

```sql
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_course_member(uuid, uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_dashboard_stats(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_cache_version(text, uuid)       TO authenticated;
```

`anon` is intentionally excluded — none of these are needed pre-login.

## Validation

After the migration:
1. Reload `/admin/students`, `/admin/teachers`, `/admin/courses` as the bypass admin — rows should reappear.
2. Open a teacher course dashboard — `course_dashboard_stats` returns active_students/total_sessions without a 403.
3. Re-run `supabase--linter` — the two intentionally-public policies remain the only findings; the security-definer warnings stay resolved for the trigger validators.

## Out of scope

No changes to RLS policies, edge functions, or client code. Pure permission restoration.
