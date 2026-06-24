
-- 1. course_exams table (canonical exam record per course)
CREATE TABLE public.course_exams (
  id text NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'final',
  length_min integer NOT NULL DEFAULT 60,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'generated',
  approved boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, id)
);

CREATE UNIQUE INDEX course_exams_active_label_uq
  ON public.course_exams (course_id, label)
  WHERE archived_at IS NULL;

CREATE INDEX course_exams_course_archived_idx
  ON public.course_exams (course_id, archived_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_exams TO authenticated;
GRANT ALL ON public.course_exams TO service_role;

ALTER TABLE public.course_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course members manage exams"
  ON public.course_exams FOR ALL
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Enrolled students can read active exams"
  ON public.course_exams FOR SELECT
  TO authenticated
  USING (
    archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.course_id = course_exams.course_id
        AND e.student_id = auth.uid()
    )
  );

CREATE TRIGGER course_exams_set_updated_at
  BEFORE UPDATE ON public.course_exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Tie submissions to a specific exam
ALTER TABLE public.assessment_results
  ADD COLUMN IF NOT EXISTS exam_id text;

CREATE INDEX IF NOT EXISTS assessment_results_course_exam_idx
  ON public.assessment_results (course_id, exam_id)
  WHERE exam_id IS NOT NULL;

-- Backfill: infer exam_id from the first resolvable question id in question_ids jsonb
WITH first_qid AS (
  SELECT
    r.id AS result_id,
    (
      SELECT q.exam_id
      FROM public.assessment_questions q
      WHERE q.id::text = ANY (
        SELECT jsonb_array_elements_text(r.question_ids)
      )
      AND q.exam_id IS NOT NULL
      LIMIT 1
    ) AS inferred_exam_id
  FROM public.assessment_results r
  WHERE r.mode = 'exam'
    AND r.exam_id IS NULL
    AND r.question_ids IS NOT NULL
    AND jsonb_typeof(r.question_ids) = 'array'
)
UPDATE public.assessment_results r
SET exam_id = f.inferred_exam_id
FROM first_qid f
WHERE r.id = f.result_id
  AND f.inferred_exam_id IS NOT NULL;

-- 3. Migrate existing examSchedule JSON → course_exams rows
INSERT INTO public.course_exams (id, course_id, label, kind, length_min, breakdown, source, approved, position)
SELECT
  COALESCE(NULLIF(elem->>'id', ''), gen_random_uuid()::text) AS id,
  s.course_id,
  COALESCE(NULLIF(elem->>'label', ''), 'Final ' || (ord::text)) AS label,
  COALESCE(NULLIF(elem->>'kind', ''), 'final') AS kind,
  COALESCE((elem->>'lengthMin')::int, 60) AS length_min,
  COALESCE(elem->'breakdown', '{}'::jsonb) AS breakdown,
  COALESCE(NULLIF(elem->>'source', ''), 'generated') AS source,
  COALESCE((elem->>'approved')::boolean, false) AS approved,
  (ord - 1) AS position
FROM public.course_ta_settings s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.exam_schedule) = 'array'
       THEN s.exam_schedule
       ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(elem, ord)
ON CONFLICT (course_id, id) DO NOTHING;
