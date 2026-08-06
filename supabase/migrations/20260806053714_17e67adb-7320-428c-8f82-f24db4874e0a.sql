DELETE FROM public.assessment_questions WHERE question_role = 'reasoning';

ALTER TABLE public.assessment_questions
  DROP CONSTRAINT IF EXISTS assessment_questions_question_role_check,
  DROP CONSTRAINT IF EXISTS assessment_questions_reasoning_parent_check,
  DROP CONSTRAINT IF EXISTS assessment_questions_parent_question_id_fkey;

DROP INDEX IF EXISTS public.assessment_questions_unique_reasoning_per_parent;
DROP INDEX IF EXISTS public.idx_assessment_questions_parent_question_id;

ALTER TABLE public.assessment_questions
  DROP COLUMN IF EXISTS parent_question_id,
  DROP COLUMN IF EXISTS question_role;

UPDATE public.assessment_results r
SET answers = sub.cleaned
FROM (
  SELECT
    x.id,
    COALESCE(
      jsonb_agg(
        (a - 'reasoning_question_id' - 'reasoning_selected' - 'reasoning_correct'
           - 'reasoning_is_correct' - 'reasoning_bloom')
        ORDER BY ord
      ),
      '[]'::jsonb
    ) AS cleaned
  FROM public.assessment_results x
  CROSS JOIN LATERAL jsonb_array_elements(x.answers) WITH ORDINALITY AS t(a, ord)
  WHERE jsonb_typeof(x.answers) = 'array'
    AND x.answers::text LIKE '%reasoning_%'
  GROUP BY x.id
) sub
WHERE r.id = sub.id;

DROP FUNCTION IF EXISTS public.reasoning_followup_analytics(uuid);