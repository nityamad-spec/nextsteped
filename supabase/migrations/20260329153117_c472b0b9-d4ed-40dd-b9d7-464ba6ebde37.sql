ALTER TABLE public.courses
  ALTER COLUMN branch TYPE text[] USING CASE WHEN branch IS NOT NULL THEN ARRAY[branch] ELSE '{}'::text[] END,
  ALTER COLUMN branch SET DEFAULT '{}'::text[];

ALTER TABLE public.courses
  ALTER COLUMN graduation_year TYPE text[] USING CASE WHEN graduation_year IS NOT NULL THEN ARRAY[graduation_year] ELSE '{}'::text[] END,
  ALTER COLUMN graduation_year SET DEFAULT '{}'::text[];