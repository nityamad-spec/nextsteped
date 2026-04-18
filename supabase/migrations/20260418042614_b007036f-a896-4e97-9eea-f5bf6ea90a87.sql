ALTER TABLE public.courses 
  ADD COLUMN IF NOT EXISTS midterm_week integer,
  ADD COLUMN IF NOT EXISTS final_week integer;