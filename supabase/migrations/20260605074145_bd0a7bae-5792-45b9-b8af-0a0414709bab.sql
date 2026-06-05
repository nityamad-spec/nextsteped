DROP POLICY IF EXISTS "Students read visible lesson_plan_weeks" ON public.lesson_plan_weeks;

CREATE POLICY "Students read visible lesson_plan_weeks"
ON public.lesson_plan_weeks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.course_id = lesson_plan_weeks.course_id
      AND e.student_id = auth.uid()
      AND lesson_plan_weeks.locked = false
      AND (
        c.start_date IS NULL
        OR lesson_plan_weeks.week_number <= GREATEST(
          1,
          LEAST(
            COALESCE(c.total_weeks, 16),
            (floor(EXTRACT(epoch FROM (now() - c.start_date::timestamp with time zone)) / (7 * 24 * 3600)::numeric))::integer + 1
          )
        )
      )
  )
);

UPDATE public.lesson_plan_weeks SET locked = false WHERE locked = true;