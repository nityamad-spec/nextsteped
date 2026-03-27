
CREATE POLICY "Collaborators can edit TA settings"
  ON public.course_ta_settings FOR ALL TO authenticated
  USING (is_course_member(course_id, auth.uid()))
  WITH CHECK (is_course_member(course_id, auth.uid()));
