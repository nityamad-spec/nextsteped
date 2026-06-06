
-- Course-level mastery per student per course
CREATE TABLE public.student_course_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  mastery_score numeric(5,4) NOT NULL CHECK (mastery_score >= 0 AND mastery_score <= 1),
  learner_level text NOT NULL CHECK (learner_level IN ('beginner','developing','proficient','expert')),
  accuracy_component numeric(5,4),
  pace_component numeric(5,4),
  confidence_component numeric(5,4),
  last_source text CHECK (last_source IN ('diagnostic','weekly_quiz','exam','practice')),
  last_source_id uuid,
  sample_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

GRANT SELECT ON public.student_course_mastery TO authenticated;
GRANT ALL ON public.student_course_mastery TO service_role;

ALTER TABLE public.student_course_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own course mastery"
  ON public.student_course_mastery FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "course teachers read course mastery"
  ON public.student_course_mastery FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "admins read all course mastery"
  ON public.student_course_mastery FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_scm_course ON public.student_course_mastery (course_id);
CREATE INDEX idx_scm_student ON public.student_course_mastery (student_id);

CREATE TRIGGER trg_scm_updated_at
  BEFORE UPDATE ON public.student_course_mastery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Concept-level mastery per student per course per concept
CREATE TABLE public.student_concept_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  concept_code text NOT NULL,
  mastery_score numeric(5,4) NOT NULL CHECK (mastery_score >= 0 AND mastery_score <= 1),
  mastery_level text NOT NULL CHECK (mastery_level IN ('beginner','developing','proficient','expert')),
  questions_attempted integer NOT NULL DEFAULT 0,
  questions_correct integer NOT NULL DEFAULT 0,
  last_source text CHECK (last_source IN ('diagnostic','weekly_quiz','exam','practice')),
  last_source_id uuid,
  last_assessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id, concept_id)
);

GRANT SELECT ON public.student_concept_mastery TO authenticated;
GRANT ALL ON public.student_concept_mastery TO service_role;

ALTER TABLE public.student_concept_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own concept mastery"
  ON public.student_concept_mastery FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "course teachers read concept mastery"
  ON public.student_concept_mastery FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "admins read all concept mastery"
  ON public.student_concept_mastery FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_sccm_course_concept ON public.student_concept_mastery (course_id, concept_id);
CREATE INDEX idx_sccm_student_course ON public.student_concept_mastery (student_id, course_id);

CREATE TRIGGER trg_sccm_updated_at
  BEFORE UPDATE ON public.student_concept_mastery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
