ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institution text,
  ADD COLUMN IF NOT EXISTS designation text;