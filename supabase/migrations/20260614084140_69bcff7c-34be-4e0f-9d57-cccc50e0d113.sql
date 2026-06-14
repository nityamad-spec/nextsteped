CREATE TABLE public.diagnostic_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  tier text NOT NULL CHECK (tier IN ('standard','easy','medium','hard')),
  status text NOT NULL CHECK (status IN ('pending','calling_model','validating','done','failed','skipped')),
  requested int NOT NULL DEFAULT 0,
  accepted int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, tier)
);

GRANT SELECT ON public.diagnostic_generation_runs TO authenticated;
GRANT ALL ON public.diagnostic_generation_runs TO service_role;

ALTER TABLE public.diagnostic_generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course members read runs"
  ON public.diagnostic_generation_runs FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE INDEX idx_dgr_course_updated ON public.diagnostic_generation_runs (course_id, updated_at DESC);
CREATE INDEX idx_dgr_run ON public.diagnostic_generation_runs (run_id);

CREATE TRIGGER update_diagnostic_generation_runs_updated_at
  BEFORE UPDATE ON public.diagnostic_generation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();