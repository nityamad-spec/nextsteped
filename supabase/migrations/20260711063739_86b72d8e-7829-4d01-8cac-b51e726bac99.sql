CREATE POLICY "Course teachers can view course chat_sessions"
  ON public.chat_sessions FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Course teachers can view course chat_messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND public.is_course_member(s.course_id, auth.uid())
    )
  );