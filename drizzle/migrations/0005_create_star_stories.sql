CREATE TABLE public.star_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  themes text[] NOT NULL DEFAULT '{}',
  situation text NOT NULL DEFAULT '',
  task text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  result text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_star_stories_student_course ON public.star_stories (student_id, course_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.star_stories TO authenticated;
GRANT ALL ON public.star_stories TO service_role;

ALTER TABLE public.star_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own star stories"
  ON public.star_stories FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Students insert own star stories"
  ON public.star_stories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own star stories"
  ON public.star_stories FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students delete own star stories"
  ON public.star_stories FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

CREATE TRIGGER trg_star_stories_updated_at
  BEFORE UPDATE ON public.star_stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();