-- Allow admins to view all assessment results
CREATE POLICY "Admins can view all assessment results"
  ON public.assessment_results FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Allow admins to view all diagnostic results
CREATE POLICY "Admins can view all diagnostic results"
  ON public.diagnostic_results FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));