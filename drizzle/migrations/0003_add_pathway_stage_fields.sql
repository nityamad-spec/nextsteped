ALTER TABLE public.lesson_plan_weeks ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE public.lesson_plan_weeks ADD COLUMN IF NOT EXISTS est_hours integer;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS soft_skills_hours integer;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS capstone_hours integer;