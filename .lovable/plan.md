

## Plan: Fix Admin Access to Assessment & Diagnostic Results

### Problem
The admin user can navigate to `/teacher/assessment-analytics` and see the course name, but both `assessment_results` and `diagnostic_results` queries return empty arrays because RLS has no admin-level SELECT policies on these tables. The `is_course_member()` function only checks `courses.teacher_id` and `course_teachers` — it does not account for admin users.

### Solution
Add RLS SELECT policies for admin users on both tables, matching the existing pattern used on the `courses` table.

### Changes

**Database Migration — 2 new RLS policies:**

```sql
-- Allow admins to view all assessment results
CREATE POLICY "Admins can view all assessment results"
  ON public.assessment_results FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Allow admins to view all diagnostic results
CREATE POLICY "Admins can view all diagnostic results"
  ON public.diagnostic_results FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
```

No code changes needed — the page queries are correct, they just return empty due to RLS.

### Note
If there is also genuinely no student data yet (no students have completed assessments), the page will still show "No assessment results yet" even after the RLS fix. The RLS fix ensures that when data does exist, the admin can see it.

