ALTER TABLE public.teacher_applications
  ADD COLUMN IF NOT EXISTS institution text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;