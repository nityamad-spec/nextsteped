ALTER TABLE public.lesson_plan_weeks
  ADD COLUMN is_coding_week boolean NOT NULL DEFAULT false;

ALTER TABLE public.lesson_plan_weeks
  ADD CONSTRAINT lesson_plan_weeks_not_exam_and_coding
  CHECK (NOT (is_coding_week AND is_exam_week));