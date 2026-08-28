-- 1. course_type on courses
ALTER TABLE public.courses
  ADD COLUMN course_type text NOT NULL DEFAULT 'academic';

ALTER TABLE public.courses
  ADD CONSTRAINT courses_course_type_check CHECK (course_type IN ('academic', 'employment'));

CREATE OR REPLACE FUNCTION public.courses_course_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.course_type IS NOT DISTINCT FROM OLD.course_type THEN
    RETURN NEW;
  END IF;
  -- Service role (edge functions) and admins may change the course type.
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Course type is locked after creation' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_courses_course_type_guard
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.courses_course_type_guard();

-- 2. Soft skills modules
CREATE TABLE public.course_soft_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  outcomes text[] NOT NULL DEFAULT '{}',
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_soft_skills TO authenticated;
GRANT ALL ON public.course_soft_skills TO service_role;

ALTER TABLE public.course_soft_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course teachers manage soft skills"
  ON public.course_soft_skills FOR ALL
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Enrolled students read published soft skills"
  ON public.course_soft_skills FOR SELECT
  TO authenticated
  USING (published AND public.is_active_enrollment(course_id, auth.uid()));

CREATE INDEX idx_course_soft_skills_course ON public.course_soft_skills (course_id, position);

CREATE TRIGGER trg_course_soft_skills_updated_at
  BEFORE UPDATE ON public.course_soft_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Bloom level on coding exercises
ALTER TABLE public.coding_exercises
  ADD COLUMN bloom_level integer,
  ADD COLUMN bloom_justification text;