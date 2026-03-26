-- 1. Create concepts table
CREATE TABLE public.concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  concept_id text NOT NULL,
  weight numeric(5,4) NOT NULL DEFAULT 0.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, concept_id)
);

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own concepts"
  ON public.concepts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = concepts.course_id
      AND courses.teacher_id = auth.uid()
  ));

CREATE POLICY "Students can view concepts for enrolled courses"
  ON public.concepts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.course_id = concepts.course_id
      AND enrollments.student_id = auth.uid()
  ));

-- 2. Add concept_id FK to diagnostic_questions
ALTER TABLE public.diagnostic_questions
  ADD COLUMN concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL;