ALTER TABLE public.assessment_questions
  ADD COLUMN parent_question_id uuid NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  ADD COLUMN question_role text NOT NULL DEFAULT 'primary';

ALTER TABLE public.assessment_questions
  ADD CONSTRAINT assessment_questions_question_role_check
    CHECK (question_role IN ('primary', 'reasoning'));

ALTER TABLE public.assessment_questions
  ADD CONSTRAINT assessment_questions_reasoning_requires_parent
    CHECK (
      (question_role = 'primary'   AND parent_question_id IS NULL) OR
      (question_role = 'reasoning' AND parent_question_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_assessment_questions_parent_question_id
  ON public.assessment_questions(parent_question_id)
  WHERE parent_question_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_assessment_questions_one_reasoning_per_parent
  ON public.assessment_questions(parent_question_id)
  WHERE question_role = 'reasoning';