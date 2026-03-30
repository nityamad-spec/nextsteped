
DO $$
DECLARE
  rec RECORD;
  new_answers jsonb;
  i int;
  arr_len int;
  q_id text;
  ans_idx int;
  sel text;
  corr text;
  is_corr boolean;
  t_ms int;
  conf int;
  q_text text;
  q_topic text;
  q_format text;
  q_options jsonb;
  letter_map text[] := ARRAY['A','B','C','D','E','F'];
BEGIN
  FOR rec IN
    SELECT id, answers, confidences, question_times, question_ids
    FROM diagnostic_results
    WHERE jsonb_typeof(answers) = 'array'
      AND jsonb_array_length(answers) > 0
      AND jsonb_typeof(answers->0) = 'number'
  LOOP
    arr_len := jsonb_array_length(rec.answers);
    new_answers := '[]'::jsonb;

    FOR i IN 0..(arr_len - 1) LOOP
      ans_idx := (rec.answers->i)::int;
      t_ms := COALESCE((rec.question_times->i)::int, 0);
      conf := COALESCE((rec.confidences->i)::int, 0);

      q_id := NULL;
      q_text := 'unknown';
      q_topic := 'unknown';
      q_format := 'mcq';
      corr := 'unknown';
      q_options := NULL;

      IF jsonb_array_length(COALESCE(rec.question_ids, '[]'::jsonb)) > i THEN
        q_id := rec.question_ids->>i;
        IF q_id IS NOT NULL AND q_id != '' THEN
          SELECT dq.content_text, dq.topic, dq.format, dq.answer, dq.options
          INTO q_text, q_topic, q_format, corr, q_options
          FROM diagnostic_questions dq
          WHERE dq.id = q_id::uuid;

          IF NOT FOUND THEN
            q_text := 'unknown';
            q_topic := 'unknown';
            q_format := 'mcq';
            corr := 'unknown';
          END IF;
        END IF;
      END IF;

      IF ans_idx = -1 OR q_format = 'short_answer' THEN
        sel := 'unknown';
        q_format := 'short_answer';
        is_corr := false;
      ELSE
        IF ans_idx >= 0 AND ans_idx < array_length(letter_map, 1) THEN
          sel := letter_map[ans_idx + 1];
        ELSE
          sel := ans_idx::text;
        END IF;
        is_corr := (sel = corr);
      END IF;

      new_answers := new_answers || jsonb_build_object(
        'question_id', COALESCE(q_id, 'unknown'),
        'question_text', COALESCE(q_text, 'unknown'),
        'type', COALESCE(q_format, 'mcq'),
        'topic', COALESCE(q_topic, 'unknown'),
        'selected', sel,
        'correct', COALESCE(corr, 'unknown'),
        'is_correct', is_corr,
        'time_ms', t_ms,
        'confidence', conf
      );
    END LOOP;

    UPDATE diagnostic_results SET answers = new_answers WHERE id = rec.id;
  END LOOP;
END;
$$;
