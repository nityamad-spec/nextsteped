UPDATE public.course_material_files
SET rag_status = 'pending', rag_error = NULL
WHERE rag_status = 'processing' AND rag_indexed_at IS NULL;