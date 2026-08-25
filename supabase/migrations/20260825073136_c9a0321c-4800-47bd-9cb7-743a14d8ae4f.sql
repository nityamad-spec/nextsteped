CREATE TABLE public.coding_exercise_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.coding_exercises(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'terminal_session',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (student_id, exercise_id)
);
GRANT SELECT, INSERT ON public.coding_exercise_progress TO authenticated;
GRANT ALL ON public.coding_exercise_progress TO service_role;
ALTER TABLE public.coding_exercise_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view their own exercise progress" ON public.coding_exercise_progress FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students can log their own exercise progress" ON public.coding_exercise_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Teachers can view exercise progress for their courses" ON public.coding_exercise_progress FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.course_teachers ct WHERE ct.course_id = coding_exercise_progress.course_id AND ct.teacher_id = auth.uid()));
CREATE INDEX idx_coding_exercise_progress_student_course ON public.coding_exercise_progress (student_id, course_id);