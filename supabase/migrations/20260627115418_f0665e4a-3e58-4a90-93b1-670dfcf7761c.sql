DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='enrollments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='course_exams') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.course_exams';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='diagnostic_results') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.diagnostic_results';
  END IF;
END $$;