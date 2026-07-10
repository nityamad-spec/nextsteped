CREATE POLICY "Authenticated can submit teacher application"
ON public.teacher_applications
FOR INSERT
TO authenticated
WITH CHECK (true);