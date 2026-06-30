## Goal
Align the live database with the code state at the "added QuizRow component" checkpoint (chat message at 2026-06-30 08:26).

## What's different today vs. the checkpoint
The repo at that checkpoint had migrations through `20260629142344` ("Admins can view all course exams" on `course_exams`). The live DB has exactly **one** additional migration applied after the checkpoint:

- `20260630090408` — added RLS policy **"Teachers can view enrolled student profiles"** on `public.profiles` (FOR SELECT TO authenticated, gated by `is_course_member(enrollment.course_id, auth.uid())`).

No tables, columns, functions, triggers, or other policies were created/altered after the checkpoint. Only that one policy needs to be reversed.

## Change
Issue a single forward migration that drops the post-checkpoint policy:

```sql
DROP POLICY IF EXISTS "Teachers can view enrolled student profiles" ON public.profiles;
```

This restores `profiles` RLS to its checkpoint-era policy set. (We don't delete the historical row in `supabase_migrations.schema_migrations` — Supabase migration history is append-only; the drop above is the rollback.)

## Side effect to confirm
After this drop, teachers will lose the ability to SELECT enrolled students' `profiles` rows through that policy. Any teacher-facing UI relying on it (e.g., student names/emails on teacher pages) may stop resolving names until a replacement is reintroduced. Since the checkpoint code didn't depend on this policy, the reverted frontend should be consistent with this.

## Out of scope
- No data changes (no inserts/updates/deletes to user rows).
- No changes to `course_exams`, mastery tables, realtime publication, or any other policies — those all predate the checkpoint and stay as-is.
- No edits to repo migration files; reversal is applied as a new migration so history stays linear.