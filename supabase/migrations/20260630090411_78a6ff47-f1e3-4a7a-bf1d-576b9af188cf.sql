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