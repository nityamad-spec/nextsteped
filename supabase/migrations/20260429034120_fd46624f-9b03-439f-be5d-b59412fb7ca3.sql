-- Make teacher_setup_progress per-course
ALTER TABLE public.teacher_setup_progress
  ADD COLUMN IF NOT EXISTS course_id uuid;

-- Wipe stale rows (they pre-date course scoping and would conflict on the new unique key)
DELETE FROM public.teacher_setup_progress;

-- Drop old unique constraint(s) on (teacher_id, step_id) if they exist
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.teacher_setup_progress'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.teacher_setup_progress DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

-- New unique constraint includes course_id (nullable course_id rows treated as distinct by Postgres,
-- which is fine: they only exist transiently before a course is created).
CREATE UNIQUE INDEX IF NOT EXISTS teacher_setup_progress_teacher_course_step_key
  ON public.teacher_setup_progress (teacher_id, course_id, step_id);

CREATE INDEX IF NOT EXISTS teacher_setup_progress_course_idx
  ON public.teacher_setup_progress (course_id);