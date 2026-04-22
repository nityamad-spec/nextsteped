-- Track per-teacher per-step "opened" state in the database so the
-- "In Progress" badges on /teacher/setup persist across devices and logins.
CREATE TABLE public.teacher_setup_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  step_id TEXT NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, step_id)
);

CREATE INDEX idx_teacher_setup_progress_teacher
  ON public.teacher_setup_progress(teacher_id);

ALTER TABLE public.teacher_setup_progress ENABLE ROW LEVEL SECURITY;

-- Teachers can manage only their own progress rows
CREATE POLICY "Teachers can view own setup progress"
  ON public.teacher_setup_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own setup progress"
  ON public.teacher_setup_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own setup progress"
  ON public.teacher_setup_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own setup progress"
  ON public.teacher_setup_progress
  FOR DELETE
  TO authenticated
  USING (auth.uid() = teacher_id);

-- Admins can view/manage all rows for support/debugging
CREATE POLICY "Admins can manage all setup progress"
  ON public.teacher_setup_progress
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_teacher_setup_progress_updated_at
  BEFORE UPDATE ON public.teacher_setup_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();