
CREATE TABLE public.course_roster_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'csv',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_roster_allowlist_email_lower CHECK (email = lower(email)),
  CONSTRAINT course_roster_allowlist_unique UNIQUE (course_id, email)
);

CREATE INDEX course_roster_allowlist_course_email_idx ON public.course_roster_allowlist (course_id, email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_roster_allowlist TO authenticated;
GRANT ALL ON public.course_roster_allowlist TO service_role;

ALTER TABLE public.course_roster_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course members can view roster"
  ON public.course_roster_allowlist FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Course members can insert roster"
  ON public.course_roster_allowlist FOR INSERT TO authenticated
  WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Course members can update roster"
  ON public.course_roster_allowlist FOR UPDATE TO authenticated
  USING (public.is_course_member(course_id, auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Course members can delete roster"
  ON public.course_roster_allowlist FOR DELETE TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));

CREATE TRIGGER course_roster_allowlist_set_updated_at
  BEFORE UPDATE ON public.course_roster_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS roster_enforcement boolean NOT NULL DEFAULT false;
