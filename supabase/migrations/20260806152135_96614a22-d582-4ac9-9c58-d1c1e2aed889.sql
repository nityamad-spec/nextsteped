ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

CREATE OR REPLACE FUNCTION public.is_active_enrollment(_course_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = _course_id
      AND e.student_id = _student_id
      AND e.suspended_at IS NULL
  )
$$;

-- Read policies keyed to enrollment -> require ACTIVE enrollment
DROP POLICY IF EXISTS "Students can view assessment questions for enrolled courses" ON public.assessment_questions;
CREATE POLICY "Students can view assessment questions for enrolled courses"
ON public.assessment_questions FOR SELECT TO authenticated
USING (public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Students can view concepts for enrolled courses" ON public.concepts;
CREATE POLICY "Students can view concepts for enrolled courses"
ON public.concepts FOR SELECT TO authenticated
USING (public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Enrolled students can read active exams" ON public.course_exams;
CREATE POLICY "Enrolled students can read active exams"
ON public.course_exams FOR SELECT TO authenticated
USING (archived_at IS NULL AND public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Enrolled students read published project labs" ON public.course_project_labs;
CREATE POLICY "Enrolled students read published project labs"
ON public.course_project_labs FOR SELECT TO authenticated
USING (published = true AND public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Students can view TA settings for enrolled courses" ON public.course_ta_settings;
CREATE POLICY "Students can view TA settings for enrolled courses"
ON public.course_ta_settings FOR SELECT TO authenticated
USING (public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Enrolled students read course_youtube_links" ON public.course_youtube_links;
CREATE POLICY "Enrolled students read course_youtube_links"
ON public.course_youtube_links FOR SELECT TO authenticated
USING (public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Students can view diagnostic questions for enrolled courses" ON public.diagnostic_questions;
CREATE POLICY "Students can view diagnostic questions for enrolled courses"
ON public.diagnostic_questions FOR SELECT TO authenticated
USING (public.is_active_enrollment(course_id, auth.uid()));

DROP POLICY IF EXISTS "Students read visible lesson_plan_weeks" ON public.lesson_plan_weeks;
CREATE POLICY "Students read visible lesson_plan_weeks"
ON public.lesson_plan_weeks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = lesson_plan_weeks.course_id
      AND public.is_active_enrollment(c.id, auth.uid())
      AND lesson_plan_weeks.locked = false
      AND (
        c.start_date IS NULL
        OR lesson_plan_weeks.week_number <= GREATEST(1, LEAST(
             COALESCE(c.total_weeks, 16),
             (floor(EXTRACT(epoch FROM (now() - c.start_date::timestamptz)) / ((7 * 24) * 3600)::numeric))::integer + 1
           ))
      )
  )
);

-- Write policies -> block submissions for suspended courses
DROP POLICY IF EXISTS "Students can insert own results" ON public.assessment_results;
CREATE POLICY "Students can insert own results"
ON public.assessment_results FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND (course_id IS NULL OR public.is_active_enrollment(course_id, auth.uid()))
);

DROP POLICY IF EXISTS "Students can insert own diagnostic results" ON public.diagnostic_results;
CREATE POLICY "Students can insert own diagnostic results"
ON public.diagnostic_results FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND public.is_active_enrollment(course_id, auth.uid())
);

DROP POLICY IF EXISTS "Students insert own rationales" ON public.student_answer_rationales;
CREATE POLICY "Students insert own rationales"
ON public.student_answer_rationales FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND (course_id IS NULL OR public.is_active_enrollment(course_id, auth.uid()))
);