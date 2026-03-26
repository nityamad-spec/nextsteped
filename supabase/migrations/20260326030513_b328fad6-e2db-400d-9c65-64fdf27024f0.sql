CREATE TABLE public.diagnostic_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_id text NOT NULL,
  content_text text NOT NULL,
  format text NOT NULL DEFAULT 'mcq',
  answer text NOT NULL,
  difficulty_estimate numeric(3,2) NOT NULL DEFAULT 0.5,
  bloom_level integer NOT NULL DEFAULT 1,
  bloom_justification text,
  difficulty_justification text,
  is_distractor boolean NOT NULL DEFAULT false,
  topic text,
  options jsonb,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.diagnostic_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own diagnostic questions"
  ON public.diagnostic_questions FOR ALL
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view diagnostic questions for enrolled courses"
  ON public.diagnostic_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.course_id = diagnostic_questions.course_id
        AND enrollments.student_id = auth.uid()
    )
  );