CREATE POLICY "Admins can view all course exams"
ON public.course_exams
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));