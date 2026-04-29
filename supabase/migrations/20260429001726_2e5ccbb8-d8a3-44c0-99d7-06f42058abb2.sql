CREATE POLICY "Users can read own pending signup by email"
ON public.pending_signups
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));