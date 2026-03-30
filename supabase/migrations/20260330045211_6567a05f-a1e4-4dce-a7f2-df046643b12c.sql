
CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL,
  question_type text NOT NULL DEFAULT 'MCQ',
  question_text text NOT NULL,
  answer text NOT NULL,
  topic text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Medium',
  options jsonb,
  correct_index integer,
  explanation text,
  quiz_day integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own assessment questions"
ON public.assessment_questions FOR ALL
TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Collaborators can manage assessment questions"
ON public.assessment_questions FOR ALL
TO authenticated
USING (is_course_member(course_id, auth.uid()))
WITH CHECK (is_course_member(course_id, auth.uid()));

CREATE POLICY "Students can view assessment questions for enrolled courses"
ON public.assessment_questions FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM enrollments
  WHERE enrollments.course_id = assessment_questions.course_id
  AND enrollments.student_id = auth.uid()
));
