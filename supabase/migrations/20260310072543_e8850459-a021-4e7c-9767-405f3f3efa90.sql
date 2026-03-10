
-- Drop any existing FK constraints that may conflict, then re-add with CASCADE
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_user_id_fkey;
ALTER TABLE public.chat_sessions
  ADD CONSTRAINT chat_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.student_feedback DROP CONSTRAINT IF EXISTS student_feedback_student_id_fkey;
ALTER TABLE public.student_feedback
  ADD CONSTRAINT student_feedback_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_teacher_id_fkey;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
