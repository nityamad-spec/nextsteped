ALTER TABLE public.assessment_questions ADD COLUMN IF NOT EXISTS source_refs jsonb;
ALTER TABLE public.diagnostic_questions ADD COLUMN IF NOT EXISTS source_refs jsonb;