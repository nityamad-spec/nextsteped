CREATE TABLE public.weekly_quiz_attempt_voids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  quiz_day INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'focus_lost',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_wqav_student_course_day ON public.weekly_quiz_attempt_voids (student_id, course_id, quiz_day);

GRANT SELECT, INSERT ON public.weekly_quiz_attempt_voids TO authenticated;
GRANT ALL ON public.weekly_quiz_attempt_voids TO service_role;

ALTER TABLE public.weekly_quiz_attempt_voids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert their own voided attempts"
  ON public.weekly_quiz_attempt_voids FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students read their own voided attempts"
  ON public.weekly_quiz_attempt_voids FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Course members read voided attempts"
  ON public.weekly_quiz_attempt_voids FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));