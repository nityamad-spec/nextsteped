-- Versioned cache invalidation table for the chat edge function's RAG layer.
-- Edge function fetchers use the version in their cache key, so bumping a row
-- forces all warm instances to re-fetch on their next request.

CREATE TABLE public.cache_versions (
  scope text NOT NULL,        -- 'syllabus' | 'concepts' | 'questions'
  scope_id uuid NOT NULL,     -- teacher_id for syllabus, course_id otherwise
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id)
);

ALTER TABLE public.cache_versions ENABLE ROW LEVEL SECURITY;

-- Read access: any authenticated user can read versions (they're just integers,
-- no sensitive data). The edge function uses the service role anyway.
CREATE POLICY "Authenticated can read cache_versions"
  ON public.cache_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- Helper RPC to atomically bump a version (upsert + increment).
CREATE OR REPLACE FUNCTION public.bump_cache_version(_scope text, _scope_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_version bigint;
BEGIN
  INSERT INTO public.cache_versions (scope, scope_id, version, updated_at)
  VALUES (_scope, _scope_id, 1, now())
  ON CONFLICT (scope, scope_id)
  DO UPDATE SET
    version = public.cache_versions.version + 1,
    updated_at = now()
  RETURNING version INTO new_version;

  RETURN new_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_cache_version(text, uuid) TO authenticated;