ALTER TABLE public.resource_companies
  ADD COLUMN IF NOT EXISTS about TEXT,
  ADD COLUMN IF NOT EXISTS rounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS look_for TEXT,
  ADD COLUMN IF NOT EXISTS pro_tip TEXT,
  ADD COLUMN IF NOT EXISTS sources TEXT;

COMMENT ON COLUMN public.resource_companies.about IS 'One-paragraph company description shown before interview detail.';
COMMENT ON COLUMN public.resource_companies.rounds IS 'Ordered array of round descriptions (strings).';