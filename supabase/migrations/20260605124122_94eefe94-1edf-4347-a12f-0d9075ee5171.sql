
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_learner_level_check;

ALTER TABLE public.diagnostic_results
  ADD COLUMN IF NOT EXISTS mastery_score numeric(5,4);

UPDATE public.diagnostic_results
SET learner_level = CASE learner_level
  WHEN 'Beginner' THEN 'beginner'
  WHEN 'Progressing' THEN 'developing'
  WHEN 'Proficient' THEN 'proficient'
  WHEN 'Expert' THEN 'expert'
  ELSE lower(learner_level)
END
WHERE learner_level IS NOT NULL;

UPDATE public.profiles
SET learner_level = CASE learner_level
  WHEN 'Beginner' THEN 'beginner'
  WHEN 'Progressing' THEN 'developing'
  WHEN 'Proficient' THEN 'proficient'
  WHEN 'Expert' THEN 'expert'
  ELSE lower(learner_level)
END
WHERE learner_level IS NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_learner_level_check
  CHECK (learner_level IS NULL OR learner_level = ANY (ARRAY['beginner','developing','proficient','expert']));
