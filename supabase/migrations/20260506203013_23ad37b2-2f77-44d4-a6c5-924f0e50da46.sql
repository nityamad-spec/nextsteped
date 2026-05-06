-- 1. Clean up orphans (required before adding FKs)
DELETE FROM public.lesson_plan_weeks      WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.concepts               WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.diagnostic_questions   WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.assessment_questions   WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.assessment_results     WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.diagnostic_results     WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.course_material_files  WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.course_ta_settings     WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.course_teachers        WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.enrollments            WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.teacher_setup_progress WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM public.courses);

UPDATE public.chat_sessions    SET course_id = NULL WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM public.courses);
UPDATE public.student_feedback SET course_id = NULL WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM public.courses);
UPDATE public.pending_signups  SET course_id = NULL WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM public.courses);

-- 2. Add FKs with cascade. Drop-if-exists for idempotency.
DO $$
DECLARE
  rec record;
  cascade_tables text[] := ARRAY[
    'lesson_plan_weeks','concepts','diagnostic_questions','assessment_questions',
    'assessment_results','diagnostic_results','course_material_files',
    'course_ta_settings','course_teachers','enrollments','teacher_setup_progress'
  ];
  setnull_tables text[] := ARRAY['chat_sessions','student_feedback','pending_signups'];
  t text;
  cname text;
BEGIN
  FOREACH t IN ARRAY cascade_tables LOOP
    cname := t || '_course_id_fkey';
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, cname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE',
      t, cname
    );
  END LOOP;

  FOREACH t IN ARRAY setnull_tables LOOP
    cname := t || '_course_id_fkey';
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, cname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL',
      t, cname
    );
  END LOOP;
END $$;