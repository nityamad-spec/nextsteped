
CREATE TABLE public.diagnostic_generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  course_id uuid NOT NULL,
  tier text,
  attempt int,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  message text,
  reason text,
  data jsonb,
  gateway_call_id uuid,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.diagnostic_generation_events TO authenticated;
GRANT ALL ON public.diagnostic_generation_events TO service_role;

ALTER TABLE public.diagnostic_generation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read diagnostic generation events"
  ON public.diagnostic_generation_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_dge_run_created ON public.diagnostic_generation_events (run_id, created_at);
CREATE INDEX idx_dge_course_created ON public.diagnostic_generation_events (course_id, created_at DESC);
CREATE INDEX idx_dge_tier ON public.diagnostic_generation_events (tier);
CREATE INDEX idx_dge_status ON public.diagnostic_generation_events (status);
