ALTER TABLE public.course_material_files
  ADD COLUMN IF NOT EXISTS rag_page_cursor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rag_total_pages integer,
  ADD COLUMN IF NOT EXISTS rag_chunk_cursor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rag_pass_started_at timestamptz;