CREATE TABLE public.coding_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.coding_exercises(id) ON DELETE CASCADE,
  submitted_code text NOT NULL DEFAULT '',
  language text,
  passed boolean NOT NULL DEFAULT false,
  cases_passed integer NOT NULL DEFAULT 0,
  cases_total integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'daily',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coding_attempts_student_course_idx
  ON public.coding_attempts (student_id, course_id, created_at DESC);

GRANT SELECT, INSERT ON public.coding_attempts TO authenticated;
GRANT ALL ON public.coding_attempts TO service_role;

ALTER TABLE public.coding_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert their own coding attempts"
  ON public.coding_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students read their own coding attempts"
  ON public.coding_attempts FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Course teachers read coding attempts"
  ON public.coding_attempts FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));
