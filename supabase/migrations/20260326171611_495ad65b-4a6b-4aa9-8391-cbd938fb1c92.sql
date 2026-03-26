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