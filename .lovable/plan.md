

## Plan: Create Course-Teachers Junction Table for N:N Mapping

### Summary
Create a `course_teachers` junction table that maps courses to teachers in a many-to-many relationship, allowing multiple teachers to collaborate on a single course. The existing `courses.teacher_id` column is preserved as the "owner" teacher for backward compatibility.

### Database Migration

```sql
-- Junction table for N:N course-teacher mapping
CREATE TABLE public.course_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'collaborator',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, teacher_id)
);

ALTER TABLE public.course_teachers ENABLE ROW LEVEL SECURITY;

-- Teachers can view courses they belong to
CREATE POLICY "Teachers can view own course_teachers"
  ON public.course_teachers FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id);

-- Course owners can manage collaborators
CREATE POLICY "Course owners can manage course_teachers"
  ON public.course_teachers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_teachers.course_id
        AND courses.teacher_id = auth.uid()
    )
  );

-- Teachers can insert themselves (for accepting invites later)
CREATE POLICY "Teachers can insert own membership"
  ON public.course_teachers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id);
```

### Design Decisions

- **`role` column** — distinguishes `'owner'` from `'collaborator'`; extensible to `'viewer'` etc. later
- **`courses.teacher_id` kept** — remains as the canonical owner; avoids breaking all existing queries across 7+ files
- **`UNIQUE (course_id, teacher_id)`** — prevents duplicate memberships
- **`ON DELETE CASCADE`** on both FKs — cleanup when course or teacher profile is deleted
- **RLS** — owners can add/remove collaborators; collaborators can see their own memberships

### Scope
This migration only creates the schema. No application code or UI changes are included — those would be a follow-up to wire collaborator management into the teacher dashboard.

### Files Modified
1. New database migration — create `course_teachers` junction table with RLS policies

