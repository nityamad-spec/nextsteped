# Fix RAG Ingestion Pipeline

## Root cause recap
`ingest-rag-document` selects a non-existent `updated_at` column from `course_material_files`, so every invocation crashes at step 1. The catch block stringifies the resulting Supabase error object as `[object Object]`, hiding the real cause.

## Changes

### 1. `supabase/functions/ingest-rag-document/index.ts`
- Drop `updated_at` from the `.select(...)` list.
- Rewrite the 60-second concurrency guard to use `rag_indexed_at` as the freshness proxy (falls back to allowing the run when null, so failed rows can be retried).
- Harden the catch: extract a message via `err?.message ?? err?.error_description ?? JSON.stringify(err)` so `rag_error` always stores a readable string.
- Also fix the initial invoke's client-visible error: return `JSON.stringify({ error: msg })` (already done) but ensure `msg` is the same readable string.

### 2. Re-test end-to-end on one PDF
Manually invoke the fixed function against `aa87d968-…` (`ATCD.pdf`) and verify:
- `rag_status` transitions `failed → processing → indexed`
- `content_hash` populated
- Row count in `rag_chunks` for that `file_id` > 0
- Chunks have `page_start`, `page_end`, `embedding` (halfvec), `model_version`
- Similarity search via `match_rag_chunks` returns rows for a sample query

### 3. Backfill the 8 remaining pending PDFs
Invoke `reindex-course-rag` per course (or loop the ingest function per file_id). Report per-file success/failure and total chunks created.

## Out of scope (report only)
- Adding an `updated_at` column + trigger to `course_material_files` — larger change, defer unless you want it.
- Surfacing ingest failures in the upload UI (currently fire-and-forget `console.warn`) — separate UX task.

## Risks
- pdfjs "Path2D / DOMMatrix" polyfill warnings are informational; text extraction still works. If a PDF relies heavily on vector paths for text, OCR fallback kicks in.
- OCR fallback base64-encodes the entire PDF per empty page — large scanned PDFs could exhaust the function's memory or time budget. Will flag if observed during re-test.
- Embedding cost: 9 PDFs × ~N chunks × `gemini-embedding-001`. Expected small, but real credits.
