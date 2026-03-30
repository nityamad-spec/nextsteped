
CREATE TABLE public.assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  mode text NOT NULL,
  quiz_day integer,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  correct_answers integer NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  time_spent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert own results"
ON public.assessment_results FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can view own results"
ON public.assessment_results FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view results for their courses"
ON public.assessment_results FOR SELECT
TO authenticated
USING (is_course_member(course_id, auth.uid()));
