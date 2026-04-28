
CREATE POLICY "Anon can view universities"
  ON public.universities FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view degrees"
  ON public.degrees FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view branches"
  ON public.branches FOR SELECT
  TO anon
  USING (true);
