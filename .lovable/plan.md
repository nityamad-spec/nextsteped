## Findings

### 1. Names/emails are blank
The `profiles` table has these SELECT policies:
- `Users can view own profile` — `auth.uid() = id`
- `Authenticated users can view teacher profiles` — `role = 'teacher'`
- `Admins can view all profiles` — `is_admin(auth.uid())`

**Teachers have no policy to read their students' profile rows.** That's why on `/admin/courses` (admin) the names/emails show, but on `/teacher/courses/analytics` (teacher) the same query returns rows with `name: null, email: null` (RLS filters out the row entirely, and `CourseProfileContent` falls back to "No name"/"No email").

### 2. No refresh button
`CourseProfileContent` already subscribes to realtime `postgres_changes` on enrollments, assessment_results, diagnostic_results, student_course_mastery, course_exams, chat_sessions for the course — so data does auto-update when those tables change. But there is no manual refresh control, and a few sources (e.g. `chat_messages`, `profiles`, `student_concept_mastery`) aren't subscribed, so a manual refresh is still useful.

## Plan

### A. RLS — let teachers read their enrolled students' profiles

New migration adds a single SELECT policy on `public.profiles`:

```sql
CREATE POLICY "Teachers can view enrolled student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.student_id = profiles.id
      AND public.is_course_member(e.course_id, auth.uid())
  )
);
```

Notes:
- Uses the existing `is_course_member` security-definer function (already used by enrollments policy), so it covers both `courses.teacher_id` and `course_teachers` collaborators.
- Scoped narrowly: a teacher can only see profile rows of students enrolled in courses they teach. Other students' profiles remain hidden.
- No GRANT needed — `profiles` already grants SELECT to authenticated.

### B. Add a Refresh button

In `src/components/admin/CourseProfileContent.tsx`:
- Expose a manual refresh: convert `load` into something we can call from a button (already a `useCallback`); add a small `refreshing` state.
- Add a `Refresh` button (lucide `RefreshCw` icon, spinning while `refreshing`) inline with the University filter row. Clicking calls `load(courseId, false)` (no skeleton flash) and toggles the spinner for the duration of the fetch.
- Show this in both `variant="page"` and `variant="dialog"` (so admin Course Profile dialog also benefits — same component).

No prop changes required for `CourseAnalytics.tsx` or `CourseProfileDialog.tsx`.

### Files touched
- New: `supabase/migrations/<timestamp>_teacher_view_enrolled_student_profiles.sql`
- Edit: `src/components/admin/CourseProfileContent.tsx`

No changes to types, edge functions, or routes.
