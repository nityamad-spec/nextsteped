-- Phase 1: Incremental RAG re-ingestion schema

ALTER TABLE public.course_material_files
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.course_material_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

CREATE INDEX IF NOT EXISTS course_material_files_latest_idx
  ON public.course_material_files (course_id, folder_type)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS course_material_files_superseded_by_idx
  ON public.course_material_files (superseded_by);

-- Update match_rag_chunks to exclude superseded files
CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  _course_id uuid,
  _query_embedding vector,
  _match_count integer DEFAULT 5,
  _folder_types text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  id uuid,
  file_id uuid,
  file_name text,
  folder_type text,
  chunk_index integer,
  page_start integer,
  page_end integer,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.file_id,
    c.file_name,
    c.folder_type,
    c.chunk_index,
    c.page_start,
    c.page_end,
    c.content,
    1 - (c.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)) AS similarity
  FROM public.rag_chunks c
  JOIN public.course_material_files f ON f.id = c.file_id
  WHERE c.course_id = _course_id
    AND f.superseded_by IS NULL
    AND (_folder_types IS NULL OR c.folder_type = ANY(_folder_types))
  ORDER BY c.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)
  LIMIT GREATEST(_match_count, 1);
$function$;