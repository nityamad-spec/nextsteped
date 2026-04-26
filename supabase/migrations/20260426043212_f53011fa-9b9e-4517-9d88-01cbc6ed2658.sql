-- 1. pending_signups: stages student profile + enrollment code before email verification
CREATE TABLE IF NOT EXISTS public.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  roll_number text,
  university_id uuid REFERENCES public.universities(id),
  degree_id uuid REFERENCES public.degrees(id),
  branch_id uuid REFERENCES public.branches(id),
  graduation_year text,
  enrollment_code text NOT NULL,
  course_id uuid REFERENCES public.courses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON public.pending_signups (email);

ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pending_signups"
  ON public.pending_signups FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. profiles.active_course_id: remember the last viewed course
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_course_id uuid REFERENCES public.courses(id);

-- 3. diagnostic_results: one per (student, course)
-- First backfill any nulls to avoid breaking the unique constraint
UPDATE public.diagnostic_results dr
SET course_id = e.course_id
FROM public.enrollments e
WHERE dr.course_id IS NULL
  AND e.student_id = dr.student_id;

-- Now make course_id required and unique per student
ALTER TABLE public.diagnostic_results
  ALTER COLUMN course_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_results_student_course
  ON public.diagnostic_results (student_id, course_id);
