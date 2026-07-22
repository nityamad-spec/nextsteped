
CREATE OR REPLACE FUNCTION public.reasoning_followup_analytics(_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MIN_PCT constant numeric := 0.20;
  MIN_ATTEMPTS constant int := 5;
  R constant numeric := 0.5;   -- REASONING_BOOST_FRACTION
  P constant numeric := 0.25;  -- REASONING_PENALTY_FRACTION
  per_item jsonb;
  coverage jsonb;
  impact jsonb;
BEGIN
  IF NOT public.is_course_member(_course_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised for this course' USING ERRCODE = '42501';
  END IF;

  -- Flatten all answer rows once for reuse
  WITH ans AS (
    SELECT
      (a->>'question_id')::uuid AS primary_qid,
      (a->>'is_correct')::boolean AS primary_correct,
      NULLIF(a->>'reasoning_question_id','')::uuid AS reasoning_qid,
      CASE
        WHEN a ? 'reasoning_is_correct' AND (a->>'reasoning_is_correct') IS NOT NULL
          THEN (a->>'reasoning_is_correct')::boolean
        ELSE NULL
      END AS reasoning_correct
    FROM public.assessment_results r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.answers,'[]'::jsonb)) AS a
    WHERE r.course_id = _course_id
      AND r.mode = 'daily_quiz'
  ),
  -- Per-item reasoning correctness
  per_item_rows AS (
    SELECT
      q.id                        AS reasoning_question_id,
      q.parent_question_id        AS parent_question_id,
      LEFT(COALESCE(pq.content_text, ''), 140) AS parent_stem,
      q.topic                     AS concept_code,
      q.bloom_level               AS bloom,
      COUNT(*) FILTER (WHERE ans.reasoning_correct IS NOT NULL)::int AS attempts,
      COUNT(*) FILTER (WHERE ans.reasoning_correct = true)::int      AS correct
    FROM public.assessment_questions q
    LEFT JOIN public.assessment_questions pq ON pq.id = q.parent_question_id
    LEFT JOIN ans ON ans.reasoning_qid = q.id
    WHERE q.course_id = _course_id
      AND q.question_role = 'reasoning'
    GROUP BY q.id, q.parent_question_id, pq.content_text, q.topic, q.bloom_level
  ),
  per_item_final AS (
    SELECT
      reasoning_question_id,
      parent_question_id,
      parent_stem,
      concept_code,
      bloom,
      attempts,
      correct,
      CASE WHEN attempts = 0 THEN NULL ELSE round(correct::numeric / attempts, 4) END AS pct,
      (attempts >= MIN_ATTEMPTS AND correct::numeric / NULLIF(attempts,0) < MIN_PCT) AS flagged
    FROM per_item_rows
  ),
  -- Coverage over Bloom-3+ correct primaries
  bloom3_correct AS (
    SELECT ans.*
    FROM ans
    JOIN public.assessment_questions pq ON pq.id = ans.primary_qid
    WHERE pq.question_role = 'primary'
      AND pq.bloom_level >= 3
      AND pq.course_id = _course_id
      AND ans.primary_correct = true
  ),
  has_followup AS (
    SELECT parent_question_id
    FROM public.assessment_questions
    WHERE course_id = _course_id AND question_role = 'reasoning'
  ),
  coverage_agg AS (
    SELECT
      COUNT(*)::int AS bloom3_correct_primary_answers,
      COUNT(*) FILTER (WHERE bc.reasoning_correct IS NOT NULL)::int AS followup_answered,
      COUNT(*) FILTER (
        WHERE bc.reasoning_correct IS NULL
          AND NOT EXISTS (SELECT 1 FROM has_followup h WHERE h.parent_question_id = bc.primary_qid)
      )::int AS no_followup_exists,
      COUNT(*) FILTER (
        WHERE bc.reasoning_correct IS NULL
          AND EXISTS (SELECT 1 FROM has_followup h WHERE h.parent_question_id = bc.primary_qid)
      )::int AS followup_null
    FROM bloom3_correct bc
  ),
  -- Boost / penalty distribution across all answers
  impact_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE primary_correct = true  AND reasoning_correct = true )::int AS boost_count,
      COUNT(*) FILTER (WHERE primary_correct = true  AND reasoning_correct = false)::int AS penalty_count,
      COUNT(*) FILTER (
        WHERE primary_correct = false OR reasoning_correct IS NULL
      )::int AS neutral_count
    FROM ans
  )
  SELECT
    (SELECT jsonb_agg(to_jsonb(pi) ORDER BY (pi.pct IS NULL), pi.pct ASC NULLS LAST) FROM per_item_final pi),
    to_jsonb(c.*),
    jsonb_build_object(
      'boost_count', i.boost_count,
      'penalty_count', i.penalty_count,
      'neutral_count', i.neutral_count,
      'expected_mastery_delta', round(i.boost_count * R - i.penalty_count * P, 4)
    )
  INTO per_item, coverage, impact
  FROM coverage_agg c, impact_agg i;

  RETURN jsonb_build_object(
    'per_item', COALESCE(per_item, '[]'::jsonb),
    'coverage', COALESCE(coverage, jsonb_build_object(
      'bloom3_correct_primary_answers', 0,
      'followup_answered', 0,
      'no_followup_exists', 0,
      'followup_null', 0
    )),
    'impact', COALESCE(impact, jsonb_build_object(
      'boost_count', 0,
      'penalty_count', 0,
      'neutral_count', 0,
      'expected_mastery_delta', 0
    )),
    'thresholds', jsonb_build_object(
      'min_correct_pct', MIN_PCT,
      'min_attempts', MIN_ATTEMPTS
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reasoning_followup_analytics(uuid) TO authenticated;
