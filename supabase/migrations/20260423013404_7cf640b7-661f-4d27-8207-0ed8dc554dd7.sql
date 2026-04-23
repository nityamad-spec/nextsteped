ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS lesson_plan_path text,
  ADD COLUMN IF NOT EXISTS lesson_plan_draft_path text,
  ADD COLUMN IF NOT EXISTS lesson_plan_published_at timestamptz;