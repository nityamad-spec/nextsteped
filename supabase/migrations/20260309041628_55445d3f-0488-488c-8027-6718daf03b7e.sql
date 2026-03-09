
-- Profiles table for user info
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  name TEXT NOT NULL,
  department TEXT,
  graduation_year TEXT,
  learner_level TEXT CHECK (learner_level IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Courses table
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  branch TEXT,
  term TEXT NOT NULL CHECK (term IN ('First Semester', 'Second Semester', 'Summer Semester')),
  sections TEXT[] DEFAULT '{}',
  objectives TEXT[] DEFAULT '{}',
  enrollment_code TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  syllabus_uploaded BOOLEAN NOT NULL DEFAULT false,
  materials_uploaded BOOLEAN NOT NULL DEFAULT false,
  published BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own courses" ON public.courses FOR ALL TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Students can view published courses" ON public.courses FOR SELECT TO authenticated USING (published = true);

-- Student course enrollments
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own enrollments" ON public.enrollments FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students can enroll" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Teachers can view course enrollments" ON public.enrollments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.courses WHERE courses.id = course_id AND courses.teacher_id = auth.uid())
);

-- Chat sessions table
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  mode TEXT NOT NULL CHECK (mode IN ('learning', 'exam')) DEFAULT 'learning',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Chat messages table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  has_code BOOLEAN DEFAULT false,
  code_content TEXT,
  code_language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat messages" ON public.chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Student feedback table
CREATE TABLE public.student_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  ease INTEGER CHECK (ease BETWEEN 1 AND 5),
  clarity INTEGER CHECK (clarity BETWEEN 1 AND 5),
  understanding INTEGER CHECK (understanding BETWEEN 1 AND 5),
  difficulty_match INTEGER CHECK (difficulty_match BETWEEN 1 AND 5),
  guided TEXT CHECK (guided IN ('loved', 'liked', 'neutral', 'disliked', 'want_direct')),
  comparison TEXT CHECK (comparison IN ('much_better', 'somewhat_better', 'same', 'worse')),
  usefulness INTEGER CHECK (usefulness BETWEEN 1 AND 5),
  additional_comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.student_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert own feedback" ON public.student_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can view own feedback" ON public.student_feedback FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Teachers can view feedback for their courses" ON public.student_feedback FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.courses WHERE courses.id = course_id AND courses.teacher_id = auth.uid())
);

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
