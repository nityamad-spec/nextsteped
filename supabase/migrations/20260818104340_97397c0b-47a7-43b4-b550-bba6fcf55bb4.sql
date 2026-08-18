ALTER TABLE public.assessment_attempt_voids
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cleared_by UUID;

CREATE INDEX IF NOT EXISTS idx_aav_course_uncleared
  ON public.assessment_attempt_voids (course_id, student_id)
  WHERE cleared_at IS NULL;

GRANT UPDATE ON public.assessment_attempt_voids TO authenticated;

CREATE POLICY "Course teachers and admins clear locks"
  ON public.assessment_attempt_voids FOR UPDATE TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));