# User Deletion Cascade Fix

No DB-level FK cascades exist to `auth.users` or `public.profiles`. All cleanup happens in `supabase/functions/delete-user/index.ts`. Audit found tables it currently misses.

## Changes — `supabase/functions/delete-user/index.ts` only

### Student branch — add before profile delete
```ts
await del("student_concept_mastery", q => q.eq("student_id", user_id));
await del("student_course_mastery",  q => q.eq("student_id", user_id));
```

### Teacher branch — add before profile delete
```ts
await del("course_teaching_insights", q => q.eq("generated_by", user_id));
await del("course_youtube_links",     q => q.eq("teacher_id", user_id));
await del("setup_progress_log",       q => q.eq("teacher_id", user_id));

// Null out admin reference on applications this teacher reviewed
await admin.from("teacher_applications")
  .update({ reviewed_by: null })
  .eq("reviewed_by", user_id);
```

## Retained (per user direction)
- `ai_gateway_call_log.teacher_id` — kept for accounting/usage history
- `signin_attempts` / `signup_attempts` — kept as rate-limit telemetry
- `wipe_audit_log.user_id` — admin audit trail

## Not needed
- No DB migration. Service-role client bypasses RLS; tables already exist.
- No frontend changes.
