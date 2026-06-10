CREATE OR REPLACE FUNCTION public.course_dashboard_stats(_course_id uuid)
RETURNS TABLE (active_students integer, total_sessions integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_course_member(_course_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised for this course' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active AS (
    SELECT user_id AS sid FROM public.chat_sessions
      WHERE course_id = _course_id AND updated_at >= now() - interval '14 days'
    UNION
    SELECT student_id FROM public.assessment_results
      WHERE course_id = _course_id AND created_at >= now() - interval '14 days'
    UNION
    SELECT student_id FROM public.diagnostic_results
      WHERE course_id = _course_id AND created_at >= now() - interval '14 days'
  )
  SELECT
    (SELECT COUNT(DISTINCT sid)::int FROM active),
    (SELECT COUNT(*)::int FROM public.chat_sessions WHERE course_id = _course_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.course_dashboard_stats(uuid) TO authenticated;