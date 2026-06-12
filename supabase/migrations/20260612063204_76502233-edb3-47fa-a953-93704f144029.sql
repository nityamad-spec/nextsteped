CREATE TABLE IF NOT EXISTS public.ai_gateway_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  model text,
  purpose text,
  http_status int,
  outcome text NOT NULL,
  attempt int,
  total_attempts int,
  duration_ms int,
  request_id text,
  teacher_id uuid,
  course_id uuid,
  error_code text,
  error_message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT INSERT ON public.ai_gateway_call_log TO authenticated;
GRANT SELECT ON public.ai_gateway_call_log TO authenticated;
GRANT ALL ON public.ai_gateway_call_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_ai_gateway_call_log_recent
  ON public.ai_gateway_call_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gateway_call_log_function
  ON public.ai_gateway_call_log (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gateway_call_log_failures
  ON public.ai_gateway_call_log (created_at DESC) WHERE outcome <> 'ok';
CREATE INDEX IF NOT EXISTS idx_ai_gateway_call_log_request
  ON public.ai_gateway_call_log (request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.ai_gateway_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert ai_gateway_call_log"
  ON public.ai_gateway_call_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view ai_gateway_call_log"
  ON public.ai_gateway_call_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage ai_gateway_call_log"
  ON public.ai_gateway_call_log
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));