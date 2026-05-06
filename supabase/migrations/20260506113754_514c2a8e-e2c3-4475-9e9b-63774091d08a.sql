-- NOT NULL on concept_id
ALTER TABLE public.diagnostic_questions
  ALTER COLUMN concept_id SET NOT NULL;

-- Recreate FK with RESTRICT on delete
ALTER TABLE public.diagnostic_questions
  DROP CONSTRAINT IF EXISTS diagnostic_questions_concept_id_fkey;
ALTER TABLE public.diagnostic_questions
  ADD CONSTRAINT diagnostic_questions_concept_id_fkey
  FOREIGN KEY (concept_id) REFERENCES public.concepts(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Trigger enforcing topic == concepts.concept_code
CREATE OR REPLACE FUNCTION public.diagnostic_questions_validate_topic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_diagnostic_questions_validate_topic ON public.diagnostic_questions;
CREATE TRIGGER trg_diagnostic_questions_validate_topic
BEFORE INSERT OR UPDATE OF concept_id, topic
ON public.diagnostic_questions
FOR EACH ROW
EXECUTE FUNCTION public.diagnostic_questions_validate_topic();

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_diagnostic_questions_concept_id
  ON public.diagnostic_questions(concept_id);