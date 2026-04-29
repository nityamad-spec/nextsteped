-- Allow course collaborators (and the owner via is_course_member) to update
-- the course row, including publish/enrollment_open status.
CREATE POLICY "Collaborators can update courses"
ON public.courses
FOR UPDATE
TO authenticated
USING (public.is_course_member(id, auth.uid()))
WITH CHECK (public.is_course_member(id, auth.uid()));