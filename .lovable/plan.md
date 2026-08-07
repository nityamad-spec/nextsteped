# Fix: 20 MB PDF still fails indexing (worker memory)

## What is still going wrong

The current ingest run already streams embeddings and skips OCR above 10 MB, but a single invocation still holds, at the same time:

- the raw PDF bytes plus pdfjs's own internal parse of the whole document,
- the extracted text of **every** page in one `pages[]` array,
- the full `chunks[]` list for the whole document (a second copy of that text).

For a 20 MB / several-hundred-page PDF that is comfortably past the worker's memory ceiling, so it is killed (546 `WORKER_RESOURCE_LIMIT`) before finishing.

Windowing the chunker helped, but the arrays that survive the whole run are the remaining problem. The fix is to stop trying to finish a big document in one invocation.

## The fix: resumable, page-ranged ingestion

Each invocation indexes a bounded slice of the document, saves its progress, and re-invokes itself for the next slice until the document is done.

```text
invoke(file_id)                 -> pages 1..120   -> insert chunks -> save cursor=120 -> self-invoke
invoke(file_id, resume)         -> pages 121..240 -> insert chunks -> save cursor=240 -> self-invoke
...
invoke(file_id, resume)         -> last pages     -> insert chunks -> rag_status = 'indexed'
```

### Phase 1 — Progress state on the file row

Add to `course_material_files`:

- `rag_page_cursor` (int, default 0) — last page fully indexed.
- `rag_total_pages` (int, null) — page count discovered on the first pass.
- `rag_chunk_cursor` (int, default 0) — next `chunk_index` to assign, so indexes stay unique across passes.
- `rag_pass_started_at` (timestamptz, null) — for stall detection.

### Phase 2 — Page-ranged extraction

- `extractPdfPages(bytes, fromPage, toPage)` opens the pdfjs proxy, reads only the requested page range, releases each page immediately, then destroys the proxy.
- Chunk and embed that range, insert, and free — nothing from earlier passes stays in memory.
- Pass size starts at a conservative page budget (~120 pages) and is reduced automatically if a pass sees very dense pages (character-budget cap as well as a page cap, whichever hits first).

### Phase 3 — Chaining and idempotency

- First pass only: verify the page limit (1500), compute the content hash, and delete existing `rag_chunks` for the file. Later passes never delete.
- Each pass appends chunks with `chunk_index` continuing from `rag_chunk_cursor`.
- After a pass, update the cursors, then fire a non-blocking self-invoke with `{ file_id, resume: true }`.
- Last pass sets `rag_status = 'indexed'`, `rag_indexed_at`, and `content_hash`.
- A re-entrancy guard uses `rag_pass_started_at`: a resume call is ignored if another pass started under ~3 minutes ago, so double-invokes can't duplicate chunks.

### Phase 4 — Failure and stall handling

- If a pass is killed mid-run, `rag_pass_started_at` goes stale; the next invocation (manual re-index, or the existing client retry) resumes from `rag_page_cursor` instead of restarting from page 1.
- On terminal failure, mark `failed` with a message naming the page it stopped at.

### Phase 5 — Progress in the UI

- `useRagStatus` also reads `rag_page_cursor` / `rag_total_pages`.
- `RagStatusBadge` shows "Indexing… 240/610 pages" instead of an unbounded spinner, so a multi-minute background index reads as progress rather than a hang.

## Decisions locked in

- OCR stays skipped above 10 MB — text-layer only for large scanned files (unchanged).
- No compute resize for now; reliability comes from the resumable passes.

## Risks and constraints

- **Longer wall-clock indexing.** A 600-page book becomes ~5 chained invocations. The file shows `processing` with a page counter the whole time; the TA can't cite it until it completes.
- **Partial visibility.** Chunks from completed passes are searchable before the document finishes. Acceptable, but early answers may cite only the first part of the book.
- **pdfjs re-parses per pass.** Opening the document each pass costs time (not memory) and is the price of bounded memory. Very dense PDFs may need a smaller page budget, which the character cap handles automatically.
- **Self-invocation depth.** A hard cap on passes (e.g. 20) prevents a runaway loop; hitting it marks the file `failed` with a "split this file" message.
- **Re-indexing.** Existing stuck/failed files need one re-index run under the new logic; `reindex-course-rag` covers this.
- **Hard floor.** If a single page range still can't fit in memory (extremely dense pages), splitting the source PDF remains the fallback.

## Technical touch points

- Migration: four columns on `public.course_material_files`.
- `supabase/functions/ingest-rag-document/index.ts`: page-ranged extraction, cursor handling, self-invoke chaining, pass guard.
- `src/hooks/useRagStatus.ts` and `src/components/RagStatusBadge.tsx`: page progress display.
