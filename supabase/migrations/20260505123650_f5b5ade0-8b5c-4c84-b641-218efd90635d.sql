CREATE TABLE IF NOT EXISTS public.setup_progress_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  course_id uuid,
  step_id text NOT NULL,
  action text NOT NULL,
  success boolean NOT NULL,
  error_code text,
  error_message text,
  error_details text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_setup_progress_log_teacher
  ON public.setup_progress_log (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_setup_progress_log_recent
  ON public.setup_progress_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_setup_progress_log_failures
  ON public.setup_progress_log (created_at DESC) WHERE success = false;

ALTER TABLE public.setup_progress_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can insert own log rows"
  ON public.setup_progress_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can view own log rows"
  ON public.setup_progress_log
  FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Admins manage setup_progress_log"
  ON public.setup_progress_log
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));