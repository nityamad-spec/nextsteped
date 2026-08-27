ALTER TABLE public.coding_exercise_private
  ADD COLUMN IF NOT EXISTS validation_report jsonb,
  ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone;