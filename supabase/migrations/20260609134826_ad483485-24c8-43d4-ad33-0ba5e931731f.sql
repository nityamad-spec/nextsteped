ALTER TABLE public.assessment_questions
  ADD COLUMN IF NOT EXISTS exam_id text;

CREATE INDEX IF NOT EXISTS idx_assessment_questions_course_exam
  ON public.assessment_questions (course_id, mode, exam_id);