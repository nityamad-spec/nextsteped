CREATE TABLE public.course_career_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
  interview_rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  tested_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  tested_skills text[] NOT NULL DEFAULT '{}'::text[],
  common_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  mock_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  understand_published boolean NOT NULL DEFAULT false,
  prepare_published boolean NOT NULL DEFAULT false,
  practice_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_career_readiness TO authenticated;
GRANT ALL ON public.course_career_readiness TO service_role;

ALTER TABLE public.course_career_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course teachers manage career readiness"
  ON public.course_career_readiness
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Enrolled students read career readiness"
  ON public.course_career_readiness
  FOR SELECT
  TO authenticated
  USING (public.is_active_enrollment(course_id, auth.uid()));

CREATE TRIGGER trg_course_career_readiness_updated_at
  BEFORE UPDATE ON public.course_career_readiness
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
