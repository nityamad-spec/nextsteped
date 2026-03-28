-- 1. Add enrollment_open column to courses
ALTER TABLE public.courses ADD COLUMN enrollment_open boolean NOT NULL DEFAULT true;

-- 2. Create admin_settings table
CREATE TABLE public.admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS: authenticated can read
CREATE POLICY "Authenticated can read admin_settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (true);

-- 5. RLS: admins can do everything
CREATE POLICY "Admins can manage admin_settings"
  ON public.admin_settings FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6. Seed default value
INSERT INTO public.admin_settings (key, value) VALUES ('teacher_signups_enabled', 'true');

-- 7. Admin RLS for updating courses.enrollment_open
CREATE POLICY "Admins can update courses"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));