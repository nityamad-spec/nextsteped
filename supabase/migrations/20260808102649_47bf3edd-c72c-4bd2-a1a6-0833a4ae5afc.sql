CREATE TABLE public.assessment_attempt_voids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('weekly_quiz','diagnostic','exam')),
  ref_key TEXT,
  reason TEXT NOT NULL DEFAULT 'focus_lost',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_aav_student_course_type ON public.assessment_attempt_voids (student_id, course_id, assessment_type, ref_key);

GRANT SELECT, INSERT, DELETE ON public.assessment_attempt_voids TO authenticated;
GRANT ALL ON public.assessment_attempt_voids TO service_role;

ALTER TABLE public.assessment_attempt_voids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert their own voided attempts"
  ON public.assessment_attempt_voids FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students read their own voided attempts"
  ON public.assessment_attempt_voids FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Course members read voided attempts"
  ON public.assessment_attempt_voids FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Course teachers and admins clear voided attempts"
  ON public.assessment_attempt_voids FOR DELETE TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

INSERT INTO public.assessment_attempt_voids (student_id, course_id, assessment_type, ref_key, reason, created_at)
SELECT student_id, course_id, 'weekly_quiz', quiz_day::text, reason, created_at
FROM public.weekly_quiz_attempt_voids;

DROP TABLE public.weekly_quiz_attempt_voids;