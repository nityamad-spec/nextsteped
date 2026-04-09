ALTER TABLE public.courses
  ADD COLUMN total_weeks integer DEFAULT 16,
  ADD COLUMN sessions_per_week integer DEFAULT 2,
  ADD COLUMN session_length_minutes integer DEFAULT 60;