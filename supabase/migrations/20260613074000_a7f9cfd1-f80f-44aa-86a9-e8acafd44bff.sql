
CREATE TABLE public.wipe_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  user_id uuid NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  ok boolean NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wipe_audit_log TO authenticated;
GRANT ALL ON public.wipe_audit_log TO service_role;

ALTER TABLE public.wipe_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read all wipe audit"
  ON public.wipe_audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "course members read own wipe audit"
  ON public.wipe_audit_log FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE INDEX wipe_audit_log_course_idx ON public.wipe_audit_log (course_id, created_at DESC);
CREATE INDEX wipe_audit_log_created_idx ON public.wipe_audit_log (created_at DESC);
