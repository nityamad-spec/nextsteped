ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS destructive_reset_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS destructive_reset_allowed_by UUID,
  ADD COLUMN IF NOT EXISTS destructive_reset_allowed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.courses.destructive_reset_allowed IS 'Admin-granted permission for a teacher to run the syllabus cascade wipe on this course. Consumed (reset to false) after one successful wipe.';