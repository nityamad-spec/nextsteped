DROP POLICY IF EXISTS "Admins can view all chat_sessions" ON public.chat_sessions;
CREATE POLICY "Admins can manage all chat_sessions"
  ON public.chat_sessions
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));