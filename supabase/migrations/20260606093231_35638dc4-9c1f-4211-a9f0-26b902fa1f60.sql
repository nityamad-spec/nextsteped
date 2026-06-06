
-- 1) Wipe existing rows so new NOT NULL columns can be enforced
DELETE FROM public.assessment_results;
DELETE FROM public.assessment_questions;

-- 2) assessment_questions: add diagnostic-style columns
ALTER TABLE public.assessment_questions
  ADD COLUMN concept_id uuid NOT NULL REFERENCES public.concepts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD COLUMN item_code text NOT NULL DEFAULT '',
  ADD COLUMN format text NOT NULL DEFAULT 'mcq',
  ADD COLUMN tier text NOT NULL DEFAULT 'standard',
  ADD COLUMN in_test boolean NOT NULL DEFAULT false,
  ADD COLUMN difficulty_estimate numeric(3,2) NOT NULL DEFAULT 0.5,
  ADD COLUMN bloom_level integer NOT NULL DEFAULT 1,
  ADD COLUMN bloom_justification text,
  ADD COLUMN difficulty_justification text,
  ADD COLUMN is_distractor boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.assessment_questions
  ADD CONSTRAINT assessment_questions_tier_check
  CHECK (tier = ANY (ARRAY['standard'::text, 'easy'::text, 'medium'::text, 'hard'::text]));

CREATE INDEX IF NOT EXISTS idx_assessment_questions_concept_id
  ON public.assessment_questions (concept_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_course_tier
  ON public.assessment_questions (course_id, tier);

-- topic == concept_code validation trigger (mirrors diagnostic_questions_validate_topic)
CREATE OR REPLACE FUNCTION public.assessment_questions_validate_topic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  expected_code text;
BEGIN
  SELECT concept_code INTO expected_code
  FROM public.concepts
  WHERE id = NEW.concept_id;

  IF expected_code IS NULL THEN
    RAISE EXCEPTION 'concept_id % does not exist in concepts', NEW.concept_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.topic IS NULL OR NEW.topic <> expected_code THEN
    RAISE EXCEPTION 'topic (%) must match concepts.concept_code (%) for concept_id %',
      NEW.topic, expected_code, NEW.concept_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assessment_questions_validate_topic ON public.assessment_questions;
CREATE TRIGGER trg_assessment_questions_validate_topic
  BEFORE INSERT OR UPDATE OF concept_id, topic ON public.assessment_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.assessment_questions_validate_topic();

DROP TRIGGER IF EXISTS trg_assessment_questions_set_updated_at ON public.assessment_questions;
CREATE TRIGGER trg_assessment_questions_set_updated_at
  BEFORE UPDATE ON public.assessment_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3) assessment_results: add diagnostic-style columns
ALTER TABLE public.assessment_results
  ADD COLUMN learner_level text NOT NULL DEFAULT 'developing',
  ADD COLUMN branch_tier text,
  ADD COLUMN mastery_score numeric(5,4),
  ADD COLUMN confidences jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN question_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.assessment_results
  ADD CONSTRAINT assessment_results_branch_tier_check
  CHECK (branch_tier IS NULL OR branch_tier = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]));
