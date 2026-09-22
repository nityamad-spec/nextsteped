ALTER TABLE public.daily_dsa_questions
  ADD COLUMN concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL;

CREATE INDEX idx_daily_dsa_questions_concept ON public.daily_dsa_questions(concept_id);

COMMENT ON COLUMN public.daily_dsa_questions.concept_id IS 'Concept this question tests; tagged at generation, confirmed by professor. Null = mastery-neutral.';