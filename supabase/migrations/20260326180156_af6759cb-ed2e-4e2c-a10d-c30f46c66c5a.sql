
-- 1. Create security definer helper function
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

-- 2. Courses: add SELECT policy for collaborators
CREATE POLICY "Collaborators can view courses"
  ON public.courses FOR SELECT TO authenticated
  USING (public.is_course_member(id, auth.uid()));

-- 3. Enrollments: drop old teacher policy, replace with is_course_member
DROP POLICY IF EXISTS "Teachers can view course enrollments" ON public.enrollments;
CREATE POLICY "Teachers can view course enrollments"
  ON public.enrollments FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

-- 4. Student feedback: drop old teacher policy, replace
DROP POLICY IF EXISTS "Teachers can view feedback for their courses" ON public.student_feedback;
CREATE POLICY "Teachers can view feedback for their courses"
  ON public.student_feedback FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

-- 5. Diagnostic questions: add SELECT policy for collaborators
CREATE POLICY "Collaborators can view diagnostic questions"
  ON public.diagnostic_questions FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

-- 6. Concepts: add SELECT policy for collaborators
CREATE POLICY "Collaborators can view concepts"
  ON public.concepts FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

-- 7. Course material files: drop old select policy, replace with is_course_member
DROP POLICY IF EXISTS "Teachers can select own files" ON public.course_material_files;
CREATE POLICY "Teachers can select course files"
  ON public.course_material_files FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));
