
CREATE TABLE public.course_ta_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
  hint_ladder boolean NOT NULL DEFAULT true,
  knowledge_sources text NOT NULL DEFAULT 'uploaded_and_web',
  plagiarism_warnings boolean NOT NULL DEFAULT true,
  exam_time_limit integer NOT NULL DEFAULT 60,
  exam_difficulty text NOT NULL DEFAULT 'Mixed',
  exam_question_mix text NOT NULL DEFAULT '40% MCQ, 30% Short Answer, 30% Coding',
  exam_presentation text DEFAULT 'all_at_once',
  custom_study_prompt text DEFAULT '',
  custom_exam_prompt text DEFAULT '',
  quiz_num_questions integer DEFAULT 5,
  quiz_question_mix text DEFAULT 'mixed',
  quiz_difficulty text DEFAULT 'Medium',
  quiz_time_limit integer DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_ta_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own course TA settings"
  ON public.course_ta_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM courses WHERE courses.id = course_id AND courses.teacher_id = auth.uid()));

CREATE POLICY "Collaborators can view TA settings"
  ON public.course_ta_settings FOR SELECT TO authenticated
  USING (is_course_member(course_id, auth.uid()));

CREATE POLICY "Students can view TA settings for enrolled courses"
  ON public.course_ta_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM enrollments WHERE enrollments.course_id = course_ta_settings.course_id AND enrollments.student_id = auth.uid()));
