
-- Allow authenticated users to insert universities
CREATE POLICY "Authenticated users can insert universities"
ON public.universities FOR INSERT TO authenticated
WITH CHECK (true);

-- Allow authenticated users to insert degrees
CREATE POLICY "Authenticated users can insert degrees"
ON public.degrees FOR INSERT TO authenticated
WITH CHECK (true);

-- Allow authenticated users to insert branches
CREATE POLICY "Authenticated users can insert branches"
ON public.branches FOR INSERT TO authenticated
WITH CHECK (true);
