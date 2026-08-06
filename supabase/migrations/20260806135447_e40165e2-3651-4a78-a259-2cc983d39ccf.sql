CREATE TABLE public.student_answer_rationales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  source_format text NOT NULL CHECK (source_format IN ('weekly_quiz','exam','practice','diagnostic')),
  source_result_id uuid,
  question_id text NOT NULL,
  question_source text NOT NULL CHECK (question_source IN ('assessment_questions','diagnostic_questions','generated')),
  topic text,
  bloom_level integer NOT NULL CHECK (bloom_level BETWEEN 1 AND 6),
  selected_answer text,
  is_correct boolean,
  rationale_text text NOT NULL CHECK (char_length(rationale_text) BETWEEN 1 AND 4000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.student_answer_rationales TO authenticated;
GRANT ALL ON public.student_answer_rationales TO service_role;

ALTER TABLE public.student_answer_rationales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own rationales"
  ON public.student_answer_rationales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students read own rationales"
  ON public.student_answer_rationales FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Course teachers read course rationales"
  ON public.student_answer_rationales FOR SELECT TO authenticated
  USING (course_id IS NOT NULL AND public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Admins read all rationales"
  ON public.student_answer_rationales FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_sar_student_course ON public.student_answer_rationales (student_id, course_id);
CREATE INDEX idx_sar_source_result ON public.student_answer_rationales (source_result_id);
CREATE INDEX idx_sar_course_created ON public.student_answer_rationales (course_id, created_at DESC);

CREATE TRIGGER trg_sar_updated_at
  BEFORE UPDATE ON public.student_answer_rationales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();