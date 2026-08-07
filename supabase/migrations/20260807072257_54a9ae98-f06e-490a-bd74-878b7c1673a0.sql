-- Full-text search support for RAG chunks (hybrid retrieval)
ALTER TABLE public.rag_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS rag_chunks_content_tsv_idx
  ON public.rag_chunks USING gin (content_tsv);

CREATE INDEX IF NOT EXISTS rag_chunks_course_folder_idx
  ON public.rag_chunks (course_id, folder_type, page_start);

-- Hybrid retrieval: Reciprocal Rank Fusion of dense-vector and keyword ranks.
CREATE OR REPLACE FUNCTION public.match_rag_chunks_hybrid(
  _course_id uuid,
  _query_embedding vector,
  _query_text text,
  _match_count integer DEFAULT 8,
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
  similarity double precision,
  keyword_rank double precision,
  fused_score double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT c.*
    FROM public.rag_chunks c
    JOIN public.course_material_files f ON f.id = c.file_id
    WHERE c.course_id = _course_id
      AND f.superseded_by IS NULL
      AND (_folder_types IS NULL OR c.folder_type = ANY(_folder_types))
  ),
  dense AS (
    SELECT
      b.id,
      1 - (b.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)) AS similarity,
      row_number() OVER (
        ORDER BY b.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)
      ) AS rnk
    FROM base b
    ORDER BY b.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)
    LIMIT GREATEST(_match_count, 1) * 4
  ),
  kw AS (
    SELECT
      b.id,
      ts_rank(b.content_tsv, q.query) AS keyword_rank,
      row_number() OVER (ORDER BY ts_rank(b.content_tsv, q.query) DESC) AS rnk
    FROM base b,
         websearch_to_tsquery('english', coalesce(_query_text, '')) AS q(query)
    WHERE coalesce(_query_text, '') <> ''
      AND b.content_tsv @@ q.query
    ORDER BY ts_rank(b.content_tsv, q.query) DESC
    LIMIT GREATEST(_match_count, 1) * 4
  ),
  fused AS (
    SELECT
      COALESCE(d.id, k.id) AS id,
      COALESCE(d.similarity, 0)::double precision AS similarity,
      COALESCE(k.keyword_rank, 0)::double precision AS keyword_rank,
      (COALESCE(1.0 / (60 + d.rnk), 0) + COALESCE(1.0 / (60 + k.rnk), 0))::double precision AS fused_score
    FROM dense d
    FULL OUTER JOIN kw k ON k.id = d.id
  )
  SELECT
    b.id,
    b.file_id,
    b.file_name,
    b.folder_type,
    b.chunk_index,
    b.page_start,
    b.page_end,
    b.content,
    fused.similarity,
    fused.keyword_rank,
    fused.fused_score
  FROM fused
  JOIN base b ON b.id = fused.id
  ORDER BY fused.fused_score DESC, fused.similarity DESC
  LIMIT GREATEST(_match_count, 1);
$function$;

REVOKE ALL ON FUNCTION public.match_rag_chunks_hybrid(uuid, vector, text, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_rag_chunks_hybrid(uuid, vector, text, integer, text[]) TO service_role;

-- Direct document / week retrieval for meta-questions ("summarise the syllabus",
-- "what topics are covered in unit 2"). Bypasses similarity entirely.
CREATE OR REPLACE FUNCTION public.fetch_rag_document_chunks(
  _course_id uuid,
  _folder_types text[],
  _week integer DEFAULT NULL,
  _max_chunks integer DEFAULT 40
)
RETURNS TABLE(
  id uuid,
  file_id uuid,
  file_name text,
  folder_type text,
  chunk_index integer,
  page_start integer,
  page_end integer,
  content text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.file_id, c.file_name, c.folder_type,
    c.chunk_index, c.page_start, c.page_end, c.content
  FROM public.rag_chunks c
  JOIN public.course_material_files f ON f.id = c.file_id
  WHERE c.course_id = _course_id
    AND f.superseded_by IS NULL
    AND c.folder_type = ANY(_folder_types)
    AND (_week IS NULL OR c.page_start = _week)
  ORDER BY c.file_name, c.chunk_index
  LIMIT GREATEST(_max_chunks, 1);
$function$;

REVOKE ALL ON FUNCTION public.fetch_rag_document_chunks(uuid, text[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_rag_document_chunks(uuid, text[], integer, integer) TO service_role;