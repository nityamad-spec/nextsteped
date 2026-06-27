-- Explicit-ordering re-backfill of mastery_level.
-- Order: beginner(0) < developing(1) < proficient(2) < expert(3).
WITH ranked AS (
  SELECT
    student_id, course_id, concept_id,
    mastery_level AS raw_level,
    CASE
      WHEN COALESCE(questions_attempted, 0) < 8 THEN 'developing'
      WHEN COALESCE(questions_attempted, 0) < 15
        OR COALESCE(sample_count, 0) < 2 THEN 'proficient'
      ELSE 'expert'
    END AS cap_level
  FROM public.student_concept_mastery
  WHERE mastery_level IS NOT NULL
),
ord AS (
  SELECT r.*,
    CASE raw_level
      WHEN 'beginner' THEN 0 WHEN 'developing' THEN 1
      WHEN 'proficient' THEN 2 WHEN 'expert' THEN 3 ELSE 3 END AS raw_o,
    CASE cap_level
      WHEN 'beginner' THEN 0 WHEN 'developing' THEN 1
      WHEN 'proficient' THEN 2 WHEN 'expert' THEN 3 END AS cap_o
  FROM ranked r
)
UPDATE public.student_concept_mastery scm
SET mastery_level = CASE WHEN o.raw_o <= o.cap_o THEN o.raw_level ELSE o.cap_level END
FROM ord o
WHERE scm.student_id = o.student_id
  AND scm.course_id  = o.course_id
  AND scm.concept_id = o.concept_id;