CREATE TABLE public.course_job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  source_type text NOT NULL DEFAULT 'api' CHECK (source_type IN ('api','feed','careers')),
  active boolean NOT NULL DEFAULT true,
  has_key boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, url)
);
GRANT SELECT, UPDATE ON public.course_job_sources TO authenticated;
GRANT ALL ON public.course_job_sources TO service_role;
ALTER TABLE public.course_job_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course teachers read job sources" ON public.course_job_sources FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "Course teachers toggle job sources" ON public.course_job_sources FOR UPDATE TO authenticated
  USING (public.is_course_member(course_id, auth.uid())) WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE TABLE public.course_job_source_secrets (
  source_id uuid PRIMARY KEY REFERENCES public.course_job_sources(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.course_job_source_secrets TO service_role;
ALTER TABLE public.course_job_source_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.course_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.course_job_sources(id) ON DELETE SET NULL,
  external_key text NOT NULL,
  title text NOT NULL,
  company text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  is_remote boolean NOT NULL DEFAULT false,
  package text,
  apply_url text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('accessible','moderate','competitive')),
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, external_key)
);
GRANT SELECT ON public.course_jobs TO authenticated;
GRANT ALL ON public.course_jobs TO service_role;
ALTER TABLE public.course_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers and enrolled students read jobs" ON public.course_jobs FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_active_enrollment(course_id, auth.uid()) OR public.is_admin(auth.uid()));

-- Listings seen and rejected, so they are not re-classified each refresh.
CREATE TABLE public.course_job_rejections (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, external_key)
);
GRANT ALL ON public.course_job_rejections TO service_role;
ALTER TABLE public.course_job_rejections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.course_job_refreshes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  started_by uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  fetched_count int NOT NULL DEFAULT 0,
  new_count int NOT NULL DEFAULT 0,
  removed_count int NOT NULL DEFAULT 0,
  live_count int NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX course_job_refreshes_course_idx ON public.course_job_refreshes(course_id, started_at DESC);
GRANT SELECT ON public.course_job_refreshes TO authenticated;
GRANT ALL ON public.course_job_refreshes TO service_role;
ALTER TABLE public.course_job_refreshes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course teachers read refreshes" ON public.course_job_refreshes FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()) OR public.is_admin(auth.uid()));

CREATE TABLE public.concept_skill_tags (
  concept_id uuid PRIMARY KEY REFERENCES public.concepts(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  skill text NOT NULL,
  level text NOT NULL CHECK (level IN ('basic','working','advanced')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concept_skill_tags TO authenticated;
GRANT ALL ON public.concept_skill_tags TO service_role;
ALTER TABLE public.concept_skill_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course teachers manage skill tags" ON public.concept_skill_tags FOR ALL TO authenticated
  USING (public.is_course_member(course_id, auth.uid())) WITH CHECK (public.is_course_member(course_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.seed_default_job_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.course_type = 'employment' THEN
    INSERT INTO public.course_job_sources (course_id, name, url, source_type)
    VALUES (NEW.id, 'Remotive', 'https://remotive.com/api/remote-jobs', 'api')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_courses_seed_job_source AFTER INSERT OR UPDATE OF course_type ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_job_source();

INSERT INTO public.course_job_sources (course_id, name, url, source_type)
SELECT id, 'Remotive', 'https://remotive.com/api/remote-jobs', 'api' FROM public.courses WHERE course_type = 'employment'
ON CONFLICT DO NOTHING;