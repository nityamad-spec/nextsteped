ALTER TABLE public.course_ta_settings
  ADD COLUMN IF NOT EXISTS exam_schedule jsonb;