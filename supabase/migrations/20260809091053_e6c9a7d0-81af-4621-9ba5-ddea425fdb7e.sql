-- 1. Free-text student responses: separate short answers from MCQ rationales
ALTER TABLE public.student_answer_rationales
  ADD COLUMN response_kind text NOT NULL DEFAULT 'reasoning',
  ADD COLUMN model_answer_snapshot text;

ALTER TABLE public.student_answer_rationales
  ADD CONSTRAINT student_answer_rationales_response_kind_check
  CHECK (response_kind IN ('reasoning', 'short_answer'));

CREATE UNIQUE INDEX IF NOT EXISTS student_answer_rationales_attempt_question_uniq
  ON public.student_answer_rationales (student_id, source_result_id, question_id, response_kind)
  WHERE source_result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_answer_rationales_course_kind_idx
  ON public.student_answer_rationales (course_id, response_kind, created_at DESC);

-- 2. Question storage: model answer + optional word cap
ALTER TABLE public.assessment_questions
  ADD COLUMN model_answer text,
  ADD COLUMN answer_max_words integer;

ALTER TABLE public.diagnostic_questions
  ADD COLUMN model_answer text,
  ADD COLUMN answer_max_words integer;

-- 3. Shape validation trigger for question rows
CREATE OR REPLACE FUNCTION public.validate_question_format_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fmt text := lower(coalesce(NEW.format, ''));
BEGIN
  IF fmt IN ('short_answer', 'short answer', 'shortanswer') THEN
    IF NEW.options IS NOT NULL AND NEW.options::text NOT IN ('null', '[]', '{}') THEN
      RAISE EXCEPTION 'short-answer questions must not carry options' USING ERRCODE = '23514';
    END IF;
    IF coalesce(btrim(NEW.answer), '') = '' THEN
      RAISE EXCEPTION 'short-answer questions require a non-empty answer' USING ERRCODE = '23514';
    END IF;
  ELSIF fmt IN ('mcq', 'multiple_choice', 'multiple choice') THEN
    IF NEW.options IS NULL OR jsonb_array_length(
         CASE WHEN jsonb_typeof(NEW.options::jsonb) = 'array' THEN NEW.options::jsonb ELSE '[]'::jsonb END
       ) < 2 THEN
      RAISE EXCEPTION 'multiple-choice questions require at least two options' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assessment_questions_validate_shape
  BEFORE INSERT OR UPDATE ON public.assessment_questions
  FOR EACH ROW EXECUTE FUNCTION public.validate_question_format_shape();

CREATE TRIGGER trg_diagnostic_questions_validate_shape
  BEFORE INSERT OR UPDATE ON public.diagnostic_questions
  FOR EACH ROW EXECUTE FUNCTION public.validate_question_format_shape();

-- 4. Per-format question type counts
ALTER TABLE public.course_ta_settings
  ADD COLUMN quiz_type_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN exam_type_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN diagnostic_type_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN practice_type_counts jsonb NOT NULL DEFAULT '{}'::jsonb;