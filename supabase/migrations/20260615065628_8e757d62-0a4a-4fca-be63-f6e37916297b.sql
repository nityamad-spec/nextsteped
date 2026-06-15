GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_course_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_cache_version(text, uuid) TO authenticated;