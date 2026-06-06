
-- Drop diagnostic-only component columns from course mastery
ALTER TABLE public.student_course_mastery DROP COLUMN IF EXISTS pace_component;
ALTER TABLE public.student_course_mastery DROP COLUMN IF EXISTS confidence_component;

-- Backfill: recompute mastery_score, learner_level, accuracy_component, sample_count
-- as weighted avg of student_concept_mastery using concepts.weight (weight > 0).
WITH agg AS (
  SELECT
    scm.student_id,
    scm.course_id,
    SUM(scm.mastery_score * c.weight) / NULLIF(SUM(c.weight), 0) AS score,
    COUNT(*) FILTER (WHERE c.weight > 0) AS contributing
  FROM public.student_concept_mastery scm
  JOIN public.concepts c ON c.id = scm.concept_id
  WHERE COALESCE(c.weight, 0) > 0
  GROUP BY scm.student_id, scm.course_id
)
UPDATE public.student_course_mastery sc
SET
  mastery_score = ROUND(GREATEST(0, LEAST(1, agg.score))::numeric, 4),
  accuracy_component = ROUND(GREATEST(0, LEAST(1, agg.score))::numeric, 4),
  sample_count = agg.contributing,
  learner_level = CASE
    WHEN agg.score < 0.25 THEN 'beginner'
    WHEN agg.score < 0.50 THEN 'developing'
    WHEN agg.score < 0.75 THEN 'proficient'
    ELSE 'expert'
  END,
  updated_at = now()
FROM agg
WHERE sc.student_id = agg.student_id
  AND sc.course_id = agg.course_id;
