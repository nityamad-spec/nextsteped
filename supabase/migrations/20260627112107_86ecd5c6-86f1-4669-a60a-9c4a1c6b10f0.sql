-- Backfill mastery_level on existing student_concept_mastery rows using the new
-- evidence-gated cap. Numeric mastery_score values are left unchanged because
-- we cannot replay history without raw per-submission data.
UPDATE public.student_concept_mastery
SET mastery_level = CASE
  WHEN COALESCE(questions_attempted, 0) < 8 THEN
    LEAST(
      mastery_level,
      'developing'::text
    )
  WHEN COALESCE(questions_attempted, 0) < 15
    OR COALESCE(sample_count, 0) < 2 THEN
    LEAST(
      mastery_level,
      'proficient'::text
    )
  ELSE mastery_level
END
WHERE mastery_level IS NOT NULL;

-- Course-level: clamp learner_level to 'proficient' for any student+course
-- whose contributing concept rows are entirely from practice.
WITH practice_only AS (
  SELECT scm.student_id, scm.course_id
  FROM public.student_course_mastery scm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_concept_mastery c
    WHERE c.student_id = scm.student_id
      AND c.course_id  = scm.course_id
      AND c.last_source IS NOT NULL
      AND c.last_source <> 'practice'
  )
)
UPDATE public.student_course_mastery scm
SET learner_level = 'proficient'
FROM practice_only p
WHERE scm.student_id = p.student_id
  AND scm.course_id  = p.course_id
  AND scm.learner_level = 'expert';