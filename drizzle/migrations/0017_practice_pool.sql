CREATE TABLE public.practice_pool_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'non_coding' CHECK (kind IN ('non_coding','coding')),
  format text NOT NULL,
  concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL,
  concept_code text,
  week_number integer,
  bloom_level integer NOT NULL DEFAULT 2,
  difficulty numeric NOT NULL DEFAULT 0.5,
  title text,
  question text NOT NULL,
  options jsonb,
  language text,
  starter_code text,
  input_spec text,
  output_spec text,
  constraints text,
  standard_test_cases jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practice_pool_questions_course_idx ON public.practice_pool_questions(course_id, status, kind);

CREATE TABLE public.practice_pool_private (
  question_id uuid PRIMARY KEY REFERENCES public.practice_pool_questions(id) ON DELETE CASCADE,
  answer text,
  model_answer text,
  answer_max_words integer,
  explanation text,
  reference_solution text,
  hidden_test_cases jsonb,
  validation_report jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.practice_pool_seen (
  student_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.practice_pool_questions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  seen_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, question_id)
);

CREATE TABLE public.practice_pool_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  requested integer NOT NULL,
  from_pool integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_pool_questions TO authenticated;
GRANT ALL ON public.practice_pool_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_pool_private TO authenticated;
GRANT ALL ON public.practice_pool_private TO service_role;
GRANT SELECT ON public.practice_pool_seen TO authenticated;
GRANT ALL ON public.practice_pool_seen TO service_role;
GRANT SELECT ON public.practice_pool_topups TO authenticated;
GRANT ALL ON public.practice_pool_topups TO service_role;

ALTER TABLE public.practice_pool_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_pool_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_pool_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_pool_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course members manage pool" ON public.practice_pool_questions FOR ALL TO authenticated
  USING (public.is_course_member(course_id, auth.uid())) WITH CHECK (public.is_course_member(course_id, auth.uid()));
CREATE POLICY "Students read approved pool" ON public.practice_pool_questions FOR SELECT TO authenticated
  USING (status = 'approved' AND public.is_active_enrollment(course_id, auth.uid()));

CREATE POLICY "Course members manage pool private" ON public.practice_pool_private FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_pool_questions q WHERE q.id = question_id AND public.is_course_member(q.course_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.practice_pool_questions q WHERE q.id = question_id AND public.is_course_member(q.course_id, auth.uid())));

CREATE POLICY "Students read own seen" ON public.practice_pool_seen FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Course members read seen" ON public.practice_pool_seen FOR SELECT TO authenticated USING (public.is_course_member(course_id, auth.uid()));
CREATE POLICY "Course members read topups" ON public.practice_pool_topups FOR SELECT TO authenticated USING (public.is_course_member(course_id, auth.uid()));

CREATE TRIGGER trg_practice_pool_questions_updated_at BEFORE UPDATE ON public.practice_pool_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_practice_pool_private_updated_at BEFORE UPDATE ON public.practice_pool_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();