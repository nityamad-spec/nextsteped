CREATE TABLE public.coding_exercises (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  problem_statement text NOT NULL,
  language text NOT NULL DEFAULT 'python',
  input_spec text NOT NULL,
  output_spec text NOT NULL,
  constraints text,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  standard_test_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_coding_exercises_course_week ON public.coding_exercises(course_id, week_number);

CREATE TABLE public.coding_exercise_private (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id uuid NOT NULL UNIQUE REFERENCES public.coding_exercises(id) ON DELETE CASCADE,
  reference_solution text NOT NULL DEFAULT '',
  hidden_test_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coding_exercises TO authenticated;
GRANT ALL ON public.coding_exercises TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coding_exercise_private TO authenticated;
GRANT ALL ON public.coding_exercise_private TO service_role;

ALTER TABLE public.coding_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_exercise_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course teachers manage coding exercises"
ON public.coding_exercises
FOR ALL TO authenticated
USING (public.is_course_member(course_id, auth.uid()))
WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Students read published exercises for visible weeks"
ON public.coding_exercises
FOR SELECT TO authenticated
USING (
  published
  AND public.is_active_enrollment(course_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.lesson_plan_weeks w
    WHERE w.course_id = coding_exercises.course_id
      AND w.week_number = coding_exercises.week_number
  )
);

CREATE POLICY "Course teachers manage exercise private data"
ON public.coding_exercise_private
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coding_exercises e
    WHERE e.id = coding_exercise_private.exercise_id
      AND public.is_course_member(e.course_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coding_exercises e
    WHERE e.id = coding_exercise_private.exercise_id
      AND public.is_course_member(e.course_id, auth.uid())
  )
);

CREATE TRIGGER trg_coding_exercises_updated_at
BEFORE UPDATE ON public.coding_exercises
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_coding_exercise_private_updated_at
BEFORE UPDATE ON public.coding_exercise_private
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();