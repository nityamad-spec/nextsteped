-- Lesson plan weeks: per-week metadata with row-level visibility for students
CREATE TABLE public.lesson_plan_weeks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL,
  week_number integer NOT NULL,
  week_name text NOT NULL DEFAULT '',
  overview text NOT NULL DEFAULT '',
  is_exam_week boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT true,
  concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
  resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (course_id, week_number)
);

CREATE INDEX idx_lesson_plan_weeks_course ON public.lesson_plan_weeks(course_id, week_number);

ALTER TABLE public.lesson_plan_weeks ENABLE ROW LEVEL SECURITY;

-- Teachers / collaborators: full access for courses they're a member of
CREATE POLICY "Course members manage lesson_plan_weeks"
  ON public.lesson_plan_weeks
  FOR ALL
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()));

-- Admins
CREATE POLICY "Admins manage lesson_plan_weeks"
  ON public.lesson_plan_weeks
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Students: read ONLY weeks that are unlocked OR auto-revealed by current course week
CREATE POLICY "Students read visible lesson_plan_weeks"
  ON public.lesson_plan_weeks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.course_id = lesson_plan_weeks.course_id
        AND e.student_id = auth.uid()
        AND (
          lesson_plan_weeks.locked = false
          OR (
            c.start_date IS NOT NULL
            AND lesson_plan_weeks.week_number <= GREATEST(
              1,
              LEAST(
                COALESCE(c.total_weeks, 16),
                (FLOOR(EXTRACT(EPOCH FROM (now() - c.start_date::timestamptz)) / (7 * 24 * 3600))::int + 1)
              )
            )
          )
        )
    )
  );

-- Updated-at trigger
CREATE TRIGGER update_lesson_plan_weeks_updated_at
  BEFORE UPDATE ON public.lesson_plan_weeks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add overall outcomes column on courses (student-facing learning outcomes summary)
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS lesson_plan_overall_outcomes text;