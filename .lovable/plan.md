# RAG Pipeline — Backend Only

Ingest uploaded PDFs (syllabus, materials, lesson-plans) into a vector index and expose a reusable retrieval helper. No consumer wiring in this plan.

## Phase 1 — Schema (`rag_chunks` + pgvector)

Single migration:
- `create extension if not exists vector;`
- `rag_chunks` table: `id uuid pk`, `course_id uuid fk courses on delete cascade`, `file_id uuid fk course_material_files on delete cascade`, `storage_path text`, `file_name text`, `folder_type text`, `chunk_index int`, `page_start int`, `page_end int`, `content text`, `token_count int`, `source_type text` (`pdf_text` | `ocr`), `embedding vector(3072)`, `model_version text`, `created_at timestamptz default now()`.
- Unique: `(file_id, chunk_index)`.
- HNSW index on `((embedding::halfvec(3072)) halfvec_cosine_ops)` (pgvector caps direct vector index at 2000 dims).
- Btree on `(course_id)` and `(file_id)`.
- GRANT `select` to `authenticated` (course members read via helper), `all` to `service_role`. RLS: enabled; policy `select` where `public.is_course_member(course_id, auth.uid())`; writes service-role only.
- Add `rag_status text default 'pending'` + `rag_error text` + `rag_indexed_at timestamptz` to `course_material_files` for progress/observability.

## Phase 2 — Ingest edge function (`ingest-rag-document`)

Service-role function invoked per file. Idempotent: deletes existing `rag_chunks` for `file_id` before re-inserting.

Steps:
1. Load row from `course_material_files`; mark `rag_status='processing'`.
2. Skip if `file_name` isn't `.pdf` → mark `skipped`.
3. Download from `course-materials` storage.
4. Extract text per page with `pdfjs-dist` (npm: specifier, legacy build for Deno; no worker).
5. **OCR fallback per page only when pdfjs page text is empty/near-empty (<20 non-whitespace chars):** render that page to PNG via pdfjs canvas, send to Lovable AI Gateway vision model (`google/gemini-2.5-flash`) with a "transcribe verbatim" prompt. Tag those chunks `source_type='ocr'`.
6. Concatenate page texts (preserving page ranges), chunk to ~1000 chars with 150 overlap, split on paragraph then sentence boundaries; track originating `page_start`/`page_end` per chunk.
7. Embed in batches of ≤100 via `POST https://ai.gateway.lovable.dev/v1/embeddings` with `model: "google/gemini-embedding-001"`. Retry 429/5xx with backoff; terminal errors → mark `failed` with `rag_error`.
8. Bulk `insert` chunks with `model_version='google/gemini-embedding-001@v1'`.
9. Mark `rag_status='indexed'`, set `rag_indexed_at`.

Config: `verify_jwt=false` in `supabase/config.toml` (triggered by DB / service role only). Uses `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Phase 3 — Auto-trigger on upload

Two options, pick one at build time:
- **A (preferred):** update `upsertCourseMaterialFile` in `src/lib/courseMaterialFiles.ts` to fire-and-forget `supabase.functions.invoke('ingest-rag-document', { body: { file_id } })` right after upsert when `file_name` ends in `.pdf`. No UI change; runs from existing upload paths (FileUploadZone, lesson-plan draft/published writes, etc.).
- **B (fallback if A misses code paths):** DB trigger on `course_material_files` insert calling `pg_net.http_post` to the edge function. Requires `pg_net` extension and storing the function URL + service key in DB settings.

Plan defaults to A; A+B can coexist safely (function is idempotent).

## Phase 4 — Retrieval helper

`supabase/functions/_shared/rag-retrieve.ts` exporting `retrieveContext({ courseId, query, topK=5, folderTypes? })`:
1. Embed `query` with `google/gemini-embedding-001`.
2. Call SQL function `match_rag_chunks(course_id, query_embedding, match_count, folder_types text[])` (added in Phase 1 migration) that returns `id, file_name, folder_type, chunk_index, page_start, page_end, content, similarity` using the halfvec cast to hit the HNSW index.
3. Return an array of chunks plus a `formatPrompt(chunks, question)` helper that produces the system prompt: answer only from provided context, cite as `[<file_name> #<chunk_index>]`, say "I don't know" if insufficient.

No consumers wired in this phase (per your answer).

## Phase 5 — Backfill + tests

- `reindex-course-rag` edge function: iterates `course_material_files` for a `course_id`, invokes `ingest-rag-document` per PDF (concurrency 3). Callable by course teachers / admin. No UI.
- Deno tests: chunker (boundary + overlap correctness), OCR gating threshold, retrieval helper prompt formatting. No live-network tests.

## Risks & constraints

- **pdfjs-dist in Deno:** use the legacy build entry (`pdfjs-dist/legacy/build/pdf.mjs`) and disable worker; some npm-only globals (`DOMMatrix`, `Path2D`) need polyfills for canvas rendering used by OCR. If canvas proves brittle in Deno, fall back to sending the PDF page range directly to the vision model (`type: "file"` block) for OCR instead of rasterizing.
- **3072-dim vectors:** must use `halfvec` cast for HNSW; both index expression and query must cast identically or the index is skipped.
- **Embedding batch caps:** Gemini embeddings cap batch at 100 items and 2048 tokens per input — chunker must respect the token cap (≈1000 chars stays well under).
- **Cost/latency:** OCR fallback is the dominant cost; gating on empty pages keeps typical text PDFs cheap. Large textbooks may exceed edge function CPU/time limits — mitigate by processing in page-range batches and resuming via `rag_status`.
- **Idempotency on re-upload:** upsert path re-uses `(course_id, storage_path)`; ingest deletes prior chunks by `file_id` so re-index is safe.
- **RLS on retrieval:** helper runs server-side with service role; callers must enforce their own auth (course membership) before invoking it — documented in helper JSDoc.
- **Model version pinning:** `model_version` column enables future re-embed when switching models; mixing versions in one query is invalid.

## Out of scope

- Any UI (Content Library indicators, admin dashboards).
- Wiring `chat` / teacher `TeacherChat` to RAG (deferred phase).
- Non-PDF formats (DOCX/PPTX/TXT).
