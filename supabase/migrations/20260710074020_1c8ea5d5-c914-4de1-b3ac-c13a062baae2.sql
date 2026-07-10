
-- 1. Definer helper: teacher can view student profile
CREATE OR REPLACE FUNCTION public.teacher_can_view_student(_student_id uuid, _teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.student_id = _student_id
      AND public.is_course_member(e.course_id, _teacher_id)
  )
$$;

-- 2. Rewrite profiles teacher policy
DROP POLICY IF EXISTS "Teachers can view profiles of their enrolled students" ON public.profiles;
CREATE POLICY "Teachers can view profiles of their enrolled students"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'
  AND public.teacher_can_view_student(profiles.id, auth.uid())
);

-- 3. Replace inline profiles subqueries in admin policies with is_admin()

-- courses
DROP POLICY IF EXISTS "Admins can view all courses" ON public.courses;
CREATE POLICY "Admins can view all courses"
ON public.courses FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update courses" ON public.courses;
CREATE POLICY "Admins can update courses"
ON public.courses FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

-- course_teachers
DROP POLICY IF EXISTS "Admins can manage all course_teachers" ON public.course_teachers;
CREATE POLICY "Admins can manage all course_teachers"
ON public.course_teachers FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- enrollments
DROP POLICY IF EXISTS "Admins can view all enrollments" ON public.enrollments;
CREATE POLICY "Admins can view all enrollments"
ON public.enrollments FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));
