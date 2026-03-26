CREATE POLICY "Authenticated users can view teacher profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (role = 'teacher');