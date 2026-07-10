
CREATE TABLE public.teacher_nav_permissions (
  teacher_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  allowed_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_nav_permissions TO authenticated;
GRANT ALL ON public.teacher_nav_permissions TO service_role;

ALTER TABLE public.teacher_nav_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all nav permissions"
  ON public.teacher_nav_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Teachers can view their own nav permissions"
  ON public.teacher_nav_permissions
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

CREATE TRIGGER update_teacher_nav_permissions_updated_at
  BEFORE UPDATE ON public.teacher_nav_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
