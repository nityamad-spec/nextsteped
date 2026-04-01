

## Root Cause: RLS Blocks Admin Writes to `course_ta_settings`

### Problem
The console logs confirm repeated `42501` errors: "new row violates row-level security policy for table course_ta_settings". This happens when saving exam settings from `/teacher/setup/exam-mode`.

The `ExamMode` page uses `useTASettings(courseId)` → `saveTASettings()` which calls `supabase.from("course_ta_settings").upsert(...)`. 

### Why It Fails
The `course_ta_settings` table has two write policies:
1. **"Teachers can manage own course TA settings"** — requires `courses.teacher_id = auth.uid()`
2. **"Collaborators can edit TA settings"** — requires `is_course_member(course_id, auth.uid())`

The `is_course_member()` function only checks `courses.teacher_id` and `course_teachers.teacher_id`. **Admin users are not covered.** If the logged-in user is an admin who didn't create the course, both policies fail → RLS blocks the upsert.

### Fix
Add an RLS policy allowing admins to manage `course_ta_settings`:

```sql
CREATE POLICY "Admins can manage course TA settings"
  ON public.course_ta_settings
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
```

### Files Modified
- **Database migration only** — one new RLS policy on `course_ta_settings`. No code changes needed.

