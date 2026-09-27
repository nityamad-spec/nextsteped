ALTER TABLE public.coding_attempts ADD COLUMN score integer;
ALTER TABLE public.coding_attempts ADD COLUMN elapsed_ms integer;
COMMENT ON COLUMN public.coding_attempts.score IS 'Best-of-3 attempt score (0-100, 80/20 accuracy+pace blend) for coding lab exercises; null for attempts predating the cap.';
COMMENT ON COLUMN public.coding_attempts.elapsed_ms IS 'Client-reported ms from opening the exercise to Submit; used for the pace term.';