ALTER TABLE public.course_ta_settings ADD COLUMN exam_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.course_ta_settings ADD COLUMN quiz_enabled BOOLEAN NOT NULL DEFAULT false;

-- Backfill: match current approved values
UPDATE public.course_ta_settings SET exam_enabled = exam_approved, quiz_enabled = quiz_approved;