# Fix: Chat engagement empty on /teacher/analytics

## Root cause

Both `/admin/courses` (via `CourseProfileDialog`) and `/teacher/analytics` render the same `src/components/CourseAnalyticsView.tsx`, which queries `chat_sessions` and `chat_messages` to compute the Chat engagement aggregate.

Current RLS policies on those two tables only allow:
- the row's owning student (`auth.uid() = user_id`), and
- admins (`profiles.role = 'admin'`).

There is no policy that lets a **teacher of the course** read chat rows scoped to their `course_id`. So on the teacher page the two queries silently return 0 rows (RLS filters them out, no error), and the widget shows `0/<enrolled>` messages = 0. On the admin dialog the admin policy applies, so numbers appear.

This is a data-access issue, not a UI issue — the widget itself renders identically in both places.

## Fix

Add two RLS SELECT policies (one per table) that grant read access to teachers of the course the chat row belongs to, reusing the existing `public.is_course_member(course_id, auth.uid())` security-definer function already used elsewhere.

### Migration

```sql
CREATE POLICY "Course teachers can view course chat_sessions"
  ON public.chat_sessions FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Course teachers can view course chat_messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND public.is_course_member(s.course_id, auth.uid())
    )
  );
```

Notes:
- Read-only — no change to student ownership policy or admin policy.
- `chat_messages` has no `course_id` column, so we join through `chat_sessions.session_id` → `course_id`.
- No frontend code changes needed; `CourseAnalyticsView` will start returning real rows for teachers immediately.

## Verification

1. Sign in as a teacher of a course that has student chats.
2. Open `/teacher/analytics` → Chat engagement card should show `Students with chats` and `Total messages` matching what the admin sees in `/admin/courses` → course dialog.
3. Confirm students still only see their own chats and admins still see everything (existing policies untouched).
