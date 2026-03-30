CREATE POLICY "Teachers can view diagnostic results for their courses"
ON public.diagnostic_results
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM enrollments
    WHERE enrollments.student_id = diagnostic_results.student_id
      AND is_course_member(enrollments.course_id, auth.uid())
  )
);