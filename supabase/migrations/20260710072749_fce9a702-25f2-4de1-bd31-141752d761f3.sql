CREATE POLICY "Teachers can view profiles of their enrolled students"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'
  AND EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.student_id = profiles.id
      AND public.is_course_member(e.course_id, auth.uid())
  )
);