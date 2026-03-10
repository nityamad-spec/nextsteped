
CREATE TABLE public.diagnostic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  learner_level text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidences jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.diagnostic_results ENABLE ROW LEVEL SECURITY;

-- Each student can only have one diagnostic result
CREATE UNIQUE INDEX diagnostic_results_student_id_unique ON public.diagnostic_results (student_id);

-- Students can view their own results
CREATE POLICY "Students can view own diagnostic results"
  ON public.diagnostic_results
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

-- Students can insert their own results (only once due to unique constraint)
CREATE POLICY "Students can insert own diagnostic results"
  ON public.diagnostic_results
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);
