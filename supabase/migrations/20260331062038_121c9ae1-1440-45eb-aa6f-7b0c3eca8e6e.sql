CREATE TABLE public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_attempts_email_time ON public.signup_attempts (email, attempted_at);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;