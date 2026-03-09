
-- Make created_at nullable (but still defaults to now()) so Cloud UI doesn't require it
ALTER TABLE public.universities ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE public.degrees ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE public.branches ALTER COLUMN created_at DROP NOT NULL;
