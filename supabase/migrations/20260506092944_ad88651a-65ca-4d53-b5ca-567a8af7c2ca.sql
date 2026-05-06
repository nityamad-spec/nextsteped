-- 1. Remove orphaned rows
DELETE FROM public.teacher_setup_progress tsp
WHERE tsp.course_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = tsp.course_id);

DELETE FROM public.setup_progress_log spl
WHERE spl.course_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = spl.course_id);

-- 2. Add FKs with proper cascade behavior
ALTER TABLE public.teacher_setup_progress
  ADD CONSTRAINT teacher_setup_progress_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE public.setup_progress_log
  ADD CONSTRAINT setup_progress_log_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;