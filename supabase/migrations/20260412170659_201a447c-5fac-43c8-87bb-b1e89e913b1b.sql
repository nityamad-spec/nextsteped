ALTER TABLE public.chat_sessions DROP CONSTRAINT chat_sessions_mode_check;
ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_mode_check CHECK (mode IN ('learning', 'exam', 'teacher'));