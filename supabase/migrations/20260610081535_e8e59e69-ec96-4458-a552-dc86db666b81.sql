CREATE TABLE public.course_teaching_insights (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  insights jsonb NOT NULL,
  inputs_hash text NOT NULL,
  model text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.course_teaching_insights TO authenticated;
GRANT ALL ON public.course_teaching_insights TO service_role;

ALTER TABLE public.course_teaching_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course members read insights"
  ON public.course_teaching_insights FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE TRIGGER trg_cti_updated_at
  BEFORE UPDATE ON public.course_teaching_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();