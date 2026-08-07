ALTER TABLE public.student_answer_rationales
  ADD COLUMN IF NOT EXISTS ai_verdict text,
  ADD COLUMN IF NOT EXISTS ai_feedback text,
  ADD COLUMN IF NOT EXISTS ai_model_reasoning text,
  ADD COLUMN IF NOT EXISTS ai_evaluated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_answer_rationales_ai_verdict_check'
  ) THEN
    ALTER TABLE public.student_answer_rationales
      ADD CONSTRAINT student_answer_rationales_ai_verdict_check
      CHECK (ai_verdict IS NULL OR ai_verdict IN ('accepted', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS student_answer_rationales_ai_verdict_idx
  ON public.student_answer_rationales (course_id, ai_verdict);