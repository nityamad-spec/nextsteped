
ALTER TABLE public.diagnostic_questions
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('standard','easy','medium','hard'));

CREATE INDEX IF NOT EXISTS idx_diagnostic_questions_course_tier
  ON public.diagnostic_questions (course_id, tier);

ALTER TABLE public.diagnostic_results
  ADD COLUMN IF NOT EXISTS branch_tier text
    CHECK (branch_tier IN ('easy','medium','hard'));
