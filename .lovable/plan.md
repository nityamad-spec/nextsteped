

## Plan: Allow Collaborators to View Course Dashboard Data

### Problem
All RLS policies for course-related tables (courses, enrollments, student_feedback, diagnostic_questions, concepts, course_material_files, storage) only check `courses.teacher_id = auth.uid()`. Collaborators in `course_teachers` are locked out of all course data.

### Solution
Create a **security definer function** `is_course_member(course_id, user_id)` that returns true if the user is either the course owner OR a collaborator in `course_teachers`. Then update all relevant RLS policies to use this function instead of the direct `courses.teacher_id = auth.uid()` check.

### Database Migration

**1. Create helper function**
```sql
CREATE OR REPLACE FUNCTION public.is_course_member(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM courses WHERE id = _course_id AND teacher_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM course_teachers WHERE course_id = _course_id AND teacher_id = _user_id
  )
$$;
```

**2. Update RLS policies on these tables:**

| Table | Policy | Change |
|-------|--------|--------|
| `courses` | "Teachers can manage own courses" | Add a new SELECT policy for collaborators using `is_course_member`; keep the ALL policy for owners only |
| `enrollments` | "Teachers can view course enrollments" | Replace `courses.teacher_id` check with `is_course_member(course_id, auth.uid())` |
| `student_feedback` | "Teachers can view feedback for their courses" | Same replacement |
| `diagnostic_questions` | "Teachers can manage own diagnostic questions" | Add a separate SELECT policy for collaborators |
| `concepts` | "Teachers can manage own concepts" | Add a separate SELECT policy for collaborators |
| `course_material_files` | "Teachers can select own files" | Replace `teacher_id = auth.uid()` with `is_course_member(course_id, auth.uid())` for SELECT |

For tables where collaborators should only **view** (not edit), we add a separate SELECT policy rather than modifying the ALL policy.

### No Code Changes Required
The dashboard components already fetch data using the authenticated user's session. Once RLS allows collaborators to read course data, the existing queries will work for them automatically.

### Files Modified
1. New database migration — create `is_course_member` function and update ~6 RLS policies

