
-- One-off backfill: recompute diagnostic_results.mastery_score under new weights
-- Formula: 0.80 * accuracyScore + 0.20 * paceScore
-- accuracyScore = sum(is_correct * difficulty * bloom_weight) / sum(difficulty * bloom_weight)
-- paceScore     = avg(paceCurve(actual_ms / expected_ms))

CREATE OR REPLACE FUNCTION public.__diag_bloom_weight(bloom int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE greatest(1, least(6, coalesce(bloom, 1)))
    WHEN 1 THEN 1.0 WHEN 2 THEN 1.2 WHEN 3 THEN 1.5
    WHEN 4 THEN 1.8 WHEN 5 THEN 2.1 WHEN 6 THEN 2.5
  END::numeric
$$;

CREATE OR REPLACE FUNCTION public.__diag_expected_ms(bloom int, difficulty numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE greatest(1, least(6, coalesce(bloom, 1)))
    WHEN 1 THEN 20000 WHEN 2 THEN 30000 WHEN 3 THEN 45000
    WHEN 4 THEN 60000 WHEN 5 THEN 80000 WHEN 6 THEN 110000
  END)::numeric * (0.6 + 1.0 * greatest(0, least(1, coalesce(difficulty, 0.5))))
$$;

CREATE OR REPLACE FUNCTION public.__diag_pace_curve(r numeric)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  guess_floor numeric := 0.2;
  fast_cutoff numeric := 0.25;
  slow_decay  numeric := 2.0;
BEGIN
  IF r IS NULL OR r <= 0 THEN RETURN guess_floor; END IF;
  IF r < fast_cutoff THEN RETURN guess_floor; END IF;
  IF r <= 1.0 THEN
    RETURN guess_floor + ((r - fast_cutoff) / (1.0 - fast_cutoff)) * (1.0 - guess_floor);
  END IF;
  RETURN exp(-(r - 1.0) / slow_decay);
END;
$$;

WITH exploded AS (
  SELECT
    dr.id AS result_id,
    (ans ->> 'question_id')::uuid AS question_id,
    COALESCE((ans ->> 'is_correct')::boolean, false) AS is_correct,
    NULLIF(ans ->> 'time_ms', '')::numeric AS time_ms
  FROM public.diagnostic_results dr,
       LATERAL jsonb_array_elements(COALESCE(dr.answers, '[]'::jsonb)) AS ans
  WHERE ans ? 'question_id'
),
joined AS (
  SELECT
    e.result_id,
    e.is_correct,
    COALESCE(e.time_ms,
             public.__diag_expected_ms(dq.bloom_level, dq.difficulty_estimate)) AS actual_ms,
    dq.bloom_level,
    greatest(0, least(1, COALESCE(dq.difficulty_estimate, 0.5))) AS difficulty,
    public.__diag_bloom_weight(dq.bloom_level) AS bloom_w,
    public.__diag_expected_ms(dq.bloom_level, dq.difficulty_estimate) AS expected_ms
  FROM exploded e
  JOIN public.diagnostic_questions dq ON dq.id = e.question_id
),
per_result AS (
  SELECT
    result_id,
    SUM((CASE WHEN is_correct THEN 1 ELSE 0 END) * difficulty * bloom_w) AS earned,
    SUM(difficulty * bloom_w) AS max_pts,
    AVG(public.__diag_pace_curve(actual_ms / NULLIF(expected_ms, 0))) AS pace_score
  FROM joined
  GROUP BY result_id
),
final AS (
  SELECT
    result_id,
    greatest(0, least(1,
      0.80 * COALESCE(CASE WHEN max_pts > 0 THEN earned / max_pts END, 0)
      + 0.20 * COALESCE(pace_score, 0)
    )) AS mastery_score
  FROM per_result
)
UPDATE public.diagnostic_results dr
SET mastery_score = ROUND(f.mastery_score, 4)
FROM final f
WHERE dr.id = f.result_id;

DROP FUNCTION public.__diag_pace_curve(numeric);
DROP FUNCTION public.__diag_expected_ms(int, numeric);
DROP FUNCTION public.__diag_bloom_weight(int);
