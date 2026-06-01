CREATE TABLE public.course_youtube_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  source_file_id uuid,
  url text NOT NULL,
  video_id text,
  kind text NOT NULL DEFAULT 'video',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, url)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_youtube_links TO authenticated;
GRANT ALL ON public.course_youtube_links TO service_role;

ALTER TABLE public.course_youtube_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all course_youtube_links"
ON public.course_youtube_links FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Teachers manage own course_youtube_links"
ON public.course_youtube_links FOR ALL TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Course members manage course_youtube_links"
ON public.course_youtube_links FOR ALL TO authenticated
USING (public.is_course_member(course_id, auth.uid()))
WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE POLICY "Enrolled students read course_youtube_links"
ON public.course_youtube_links FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.enrollments e
  WHERE e.course_id = course_youtube_links.course_id
    AND e.student_id = auth.uid()
));

CREATE INDEX idx_course_youtube_links_course ON public.course_youtube_links(course_id);