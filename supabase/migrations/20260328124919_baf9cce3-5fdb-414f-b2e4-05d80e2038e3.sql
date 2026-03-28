CREATE POLICY "Anon can read admin_settings"
  ON public.admin_settings FOR SELECT
  TO anon
  USING (true);