## Current state (verified)

- **Client cap: 10 MB** — `src/components/FileUploadZone.tsx:182` rejects files >`10 * 1024 * 1024`.
- **Storage bucket cap: 10 MB** — `course-materials` bucket created with `file_size_limit = 10485760` (migration `20260320132100_...sql`).
- **No page-count cap** anywhere. `ingest-rag-document` parses every page via `unpdf` and OCRs pages with <20 chars via Gemini vision on the *entire* PDF bytes as base64.
- **Storage MIME/extension enforcement**: not currently constrained beyond client-side extension checks.

## Target

- Max file size: **30 MB**
- Max PDF pages: **1500**

## Phased plan (no code yet)

### Phase 1 — Raise limits

1. Update `FileUploadZone.tsx` size guard to 30 MB and error copy.
2. New migration to update the `course-materials` bucket `file_size_limit` to `31457280` (via `supabase--storage_update_bucket`, not raw SQL).
3. Add a 1500-page guard in `ingest-rag-document/index.ts` after `getDocumentProxy` (read `pdf.numPages`); if exceeded, mark `rag_status='skipped'` with a clear `rag_error` and return 400. Surface this to the uploader via existing toast on failed ingest.
4. Mirror the 30 MB / 1500-page limits in user-facing helper text in `ContentLibrary.tsx` and the upload zone.

### Phase 2 — Ingestion hardening (needed to make 30 MB / 1500 pages viable)

1. **Chunked embedding pacing**: current `EMBED_BATCH=100` × up to ~1500 pages could yield thousands of chunks. Add concurrency=1 with small delays and retry-with-backoff on 429/5xx from the AI Gateway.
2. **OCR gating**: today, every low-text page triggers an OCR call that re-uploads the *whole* PDF as base64. At 30 MB × N pages this will blow past the function memory/time budget and the Gateway's request-size cap. Options:
  - Cap OCR to first N low-text pages (e.g. 50) and log the rest as skipped.
  - Or hard-disable OCR when file size > ~8 MB.
3. **Function timeout & memory**: Edge Functions have a hard 400s / ~256 MB budget. Base64-encoding a 30 MB PDF alone is ~40 MB in memory. Confirm we stream / avoid duplicating buffers; consider processing on a background invocation and updating `rag_status` as it progresses.
4. **DB write batching**: keep `INSERT_BATCH=50`, but wrap in a resumable loop keyed by `chunk_index` so a mid-run failure can restart without duplicating rows (currently we `DELETE` then `INSERT` — fine, but a partial insert leaves the file un-indexed).

### Phase 3 — UX + observability

1. Show an inline progress state in `ContentLibrary` while `rag_status IN ('processing')`, plus estimated time hint for large files.
2. Surface `rag_error` inline (already stored) so a rejected 1501-page or 31 MB file gives an actionable message.
3. Admin visibility: extend the existing RAG coverage view to flag files over, say, 20 MB or 1000 pages so we can spot risk before users hit them.

### Phase 4 — Verification

- Manually test: 9 MB (regression), 25 MB / ~800 pages, 30 MB / ~1500 pages, 31 MB (rejected), 1501-page file (rejected).
- Confirm retrieval still returns citations for the large file and that TA chat latency stays acceptable.

## Risks & constraints


| Risk                                              | Impact                                                     | Mitigation                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Edge Function 400s timeout on large PDFs          | Ingestion fails midway, file stuck in `processing`         | Concurrency + backoff, OCR cap, background retries; resumable insert loop                                   |
| OCR whole-PDF-as-base64 per empty page            | Massive AI Gateway payloads, rate-limit / cost blowup      | Cap OCR pages; disable OCR above size threshold; consider per-page rasterization later                      |
| Embedding cost/latency scales linearly            | Thousands of chunks per 1500-page book; slower first-index | Pace batches; show progress UI; consider deferred/nightly indexing for very large uploads                   |
| pgvector index size grows fast (3072-dim halfvec) | Storage + query latency                                    | Monitor `rag_chunks` row counts; keep the existing HNSW index tuned; consider per-course partitioning later |
| Browser upload of 30 MB over flaky networks       | User-visible failures                                      | Rely on Supabase Storage resumable uploads if not already enabled                                           |
| Bucket policy vs Storage global cap               | Some Supabase plans cap per-object size below 30 MB        | Verify project storage limits before shipping                                                               |
| Retrieval quality on very large docs              | Top-K=5 may miss relevant chunks in a 1500-page book       | Consider raising K or adding per-file re-rank later (out of scope for this change)                          |


## Suggested improvements beyond the immediate ask

- Track `page_count` on `course_material_files` to power admin dashboards and pre-flight warnings.
- Move ingestion to a queued/background job (pg_cron or a dedicated worker function) so uploads return instantly and progress is polled.
- Introduce a per-course storage quota so a single 30 MB upload can't dominate a course's footprint.

## Questions before I implement

1. Should oversize files be **hard-rejected** at upload time, or **accepted but skipped for RAG** (still downloadable)? Hard reject at upload time
2. For very large PDFs, is it acceptable to **cap OCR to the first ~50 low-text pages** rather than OCR the entire book? **cap OCR to the first ~50 low-text pages**
3. Do you want ingestion to move to a **background job with progress UI** as part of this change, or defer that to a follow-up? defer that to a follow-up. Show real time upload and ingestion progress update on UI