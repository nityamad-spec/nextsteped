ALTER TABLE public.course_roster_allowlist
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_count integer NOT NULL DEFAULT 0;