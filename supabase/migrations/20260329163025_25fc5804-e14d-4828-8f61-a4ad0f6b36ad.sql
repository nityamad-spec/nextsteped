ALTER TABLE public.course_ta_settings
  ADD COLUMN exam_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN quiz_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN exam_manual_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN exam_manual_count integer DEFAULT NULL;