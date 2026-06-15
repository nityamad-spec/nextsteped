
-- A1: Tighten always-true INSERT policies
DROP POLICY IF EXISTS "Authenticated can insert ai_gateway_call_log" ON public.ai_gateway_call_log;
CREATE POLICY "Authenticated can insert ai_gateway_call_log"
  ON public.ai_gateway_call_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert branches" ON public.branches;
CREATE POLICY "Authenticated users can insert branches"
  ON public.branches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert degrees" ON public.degrees;
CREATE POLICY "Authenticated users can insert degrees"
  ON public.degrees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert universities" ON public.universities;
CREATE POLICY "Authenticated users can insert universities"
  ON public.universities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- teacher_applications: anonymous submission is intentional; keep but scope to anon role only
DROP POLICY IF EXISTS "Anon can submit teacher application" ON public.teacher_applications;
CREATE POLICY "Anon can submit teacher application"
  ON public.teacher_applications FOR INSERT TO anon
  WITH CHECK (true);

-- A2: Revoke SECURITY DEFINER function execution from anon/authenticated where not needed
REVOKE EXECUTE ON FUNCTION public.assessment_questions_validate_topic() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.diagnostic_questions_validate_topic() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_cache_version(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_course_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- course_dashboard_stats is called by the client; keep authenticated, drop anon/public
REVOKE EXECUTE ON FUNCTION public.course_dashboard_stats(uuid) FROM PUBLIC, anon;

-- B: Concurrency indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assessment_results_student_mode_course
  ON public.assessment_results (student_id, mode, course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_plan_weeks_course_week
  ON public.lesson_plan_weeks (course_id, week_number);
