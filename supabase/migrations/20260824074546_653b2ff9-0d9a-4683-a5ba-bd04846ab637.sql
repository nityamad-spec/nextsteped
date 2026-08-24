ALTER TABLE public.coding_exercises
  ADD COLUMN IF NOT EXISTS starter_code text,
  ADD COLUMN IF NOT EXISTS primary_language text;

CREATE TABLE public.coding_terminal_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  exercise_id uuid REFERENCES public.coding_exercises(id) ON DELETE SET NULL,
  language text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_coding_terminal_sessions_student_course
  ON public.coding_terminal_sessions (student_id, course_id, created_at);

GRANT SELECT, INSERT ON public.coding_terminal_sessions TO authenticated;
GRANT ALL ON public.coding_terminal_sessions TO service_role;

ALTER TABLE public.coding_terminal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can log their own terminal sessions"
  ON public.coding_terminal_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can view their own terminal sessions"
  ON public.coding_terminal_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view terminal sessions for their courses"
  ON public.coding_terminal_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_teachers ct
      WHERE ct.course_id = coding_terminal_sessions.course_id
        AND ct.teacher_id = auth.uid()
    )
  );