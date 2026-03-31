CREATE TABLE public.signin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_signin_attempts_email_time ON public.signin_attempts (email, attempted_at);
ALTER TABLE public.signin_attempts ENABLE ROW LEVEL SECURITY;