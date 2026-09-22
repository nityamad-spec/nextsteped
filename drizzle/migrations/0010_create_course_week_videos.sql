CREATE TABLE public.course_week_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file','link')),
  url TEXT,
  storage_path TEXT,
  duration_seconds INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, week_number, position)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_week_videos TO authenticated;
GRANT ALL ON public.course_week_videos TO service_role;

ALTER TABLE public.course_week_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course teachers manage week videos"
  ON public.course_week_videos
  FOR ALL
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Enrolled students read week videos"
  ON public.course_week_videos
  FOR SELECT
  TO authenticated
  USING (public.is_active_enrollment(course_id, auth.uid()));

CREATE TRIGGER trg_course_week_videos_updated_at
  BEFORE UPDATE ON public.course_week_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.student_video_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.course_week_videos(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, student_id)
);

GRANT SELECT, INSERT ON public.student_video_watches TO authenticated;
GRANT ALL ON public.student_video_watches TO service_role;

ALTER TABLE public.student_video_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students record and read their own watches"
  ON public.student_video_watches
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Course teachers read watches for their course"
  ON public.student_video_watches
  FOR SELECT
  TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

CREATE INDEX idx_course_week_videos_course_week ON public.course_week_videos(course_id, week_number);
CREATE INDEX idx_student_video_watches_student ON public.student_video_watches(student_id, course_id);