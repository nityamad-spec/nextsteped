CREATE TABLE public.daily_dsa_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  problem_statement text NOT NULL,
  language text NOT NULL DEFAULT 'python',
  input_spec text NOT NULL,
  output_spec text NOT NULL,
  constraints text,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  starter_code text,
  primary_language text,
  standard_test_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  bloom_level integer,
  bloom_justification text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_dsa_questions_course_week ON public.daily_dsa_questions(course_id, week_number);

CREATE TABLE public.daily_dsa_question_private (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL UNIQUE REFERENCES public.daily_dsa_questions(id) ON DELETE CASCADE,
  reference_solution text NOT NULL DEFAULT '',
  hidden_test_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_report jsonb,
  validated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_dsa_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.daily_dsa_questions(id) ON DELETE CASCADE,
  submitted_code text NOT NULL,
  language text,
  passed boolean NOT NULL DEFAULT false,
  cases_passed integer NOT NULL DEFAULT 0,
  cases_total integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_dsa_attempts_student_course ON public.daily_dsa_attempts(student_id, course_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_dsa_questions TO authenticated;
GRANT ALL ON public.daily_dsa_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_dsa_question_private TO authenticated;
GRANT ALL ON public.daily_dsa_question_private TO service_role;
GRANT SELECT, INSERT ON public.daily_dsa_attempts TO authenticated;
GRANT ALL ON public.daily_dsa_attempts TO service_role;

ALTER TABLE public.daily_dsa_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_dsa_question_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_dsa_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course teachers manage daily DSA questions"
ON public.daily_dsa_questions
FOR ALL TO authenticated
USING (public.is_course_member(course_id, auth.uid()))
WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Students read published daily DSA questions"
ON public.daily_dsa_questions
FOR SELECT TO authenticated
USING (
  published
  AND public.is_active_enrollment(course_id, auth.uid())
);

CREATE POLICY "Course teachers manage daily DSA private data"
ON public.daily_dsa_question_private
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.daily_dsa_questions q
    WHERE q.id = daily_dsa_question_private.question_id
      AND public.is_course_member(q.course_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.daily_dsa_questions q
    WHERE q.id = daily_dsa_question_private.question_id
      AND public.is_course_member(q.course_id, auth.uid())
  )
);

CREATE POLICY "Students record their own daily DSA attempts"
ON public.daily_dsa_attempts
FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students read their own daily DSA attempts"
ON public.daily_dsa_attempts
FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Course teachers read daily DSA attempts"
ON public.daily_dsa_attempts
FOR SELECT TO authenticated
USING (public.is_course_member(course_id, auth.uid()));

CREATE TRIGGER trg_daily_dsa_questions_updated_at
BEFORE UPDATE ON public.daily_dsa_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_daily_dsa_question_private_updated_at
BEFORE UPDATE ON public.daily_dsa_question_private
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();