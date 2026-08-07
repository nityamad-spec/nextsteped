# Fix: PDF indexing crashes with "not enough compute resources"

## What is happening

Uploading a large PDF triggers `ingest-rag-document`. The backend function runs inside a worker with a fixed memory ceiling. The logs for the failing run show:

```text
Warning: Badly formatted number: minus sign in the middle
Memory limit exceeded
shutdown
```

So the PDF parses, then the worker is killed mid-run — the function never returns, the browser sees HTTP 546 `WORKER_RESOURCE_LIMIT`, and the file row stays stuck on `processing` (the error handler never runs, so it is never marked `failed`).

This is not a code bug in one line; the function simply holds too much in memory at once.

## Where the memory goes

For a 30 MB / high-page PDF the function simultaneously holds:

1. The full file as `Uint8Array` (30 MB) plus the original `Blob`/`ArrayBuffer` from the download (another ~30 MB until GC).
2. `getDocumentProxy(bytes)` is called **twice** — once for the page-count guard, once inside `extractPdfPages` — so two complete pdfjs document objects exist.
3. `extractText(..., mergePages: false)` materialises the text of every page at once, then `chunkPages` concatenates all of it into one `combined` string, then splits it into paragraphs — three full copies of the document text.
4. The OCR path builds a base64 copy of the **entire** PDF by string concatenation (`bin += String.fromCharCode(...)` in a per-byte loop) — that alone is ~30 MB of JS string built through tens of millions of intermediate strings, plus a ~40 MB base64 string, and the same string is re-sent for every OCR page.
5. All embeddings are accumulated in one array before insert: 3,000 chunks x 1,536 floats x 8 bytes is ~37 MB of numbers, plus the JSON rows built on top of them.

Any one of these is survivable; together they exceed the worker limit.

## Fix

### Phase 1 — Stop duplicating the document (biggest win, lowest risk)

- Open the pdfjs document **once**: get the proxy, read `numPages` for the page guard, extract text from that same proxy, then release it (`pdf.destroy()`), and drop the reference to `bytes` before chunking.
- Extract page text page-by-page instead of `mergePages: false` over the whole document, pushing each page's cleaned text and discarding pdfjs page objects as we go.
- Chunk incrementally per page-window rather than building one giant `combined` string.

### Phase 2 — Make OCR memory-safe

- Replace the per-byte base64 loop with a chunked encoder (process the byte array in 32 KB slices) so we no longer create millions of intermediate strings.
- Only build the base64 payload when there is at least one OCR target (already true) and free it right after the OCR loop.
- Lower `OCR_MAX_PAGES` for large files, and skip OCR entirely when the PDF exceeds a size threshold (e.g. > 15 MB), recording a note in `rag_error` that OCR coverage was skipped — text-layer content still indexes.

### Phase 3 — Stream embeddings to the database

- Instead of embedding every chunk and then inserting, process in batches: embed a batch of chunks, insert those rows, discard the vectors, move on. Peak memory becomes one batch, not the whole document.
- Delete existing chunks for the file once, before the first batch (same idempotency as today).

### Phase 4 — Make failure visible instead of silent

- The worker kill bypasses the `catch`, so the row is left as `processing` forever and the UI badge spins. Add a stuck-run recovery: when the function starts and sees a `processing` row older than ~10 minutes, treat it as a failed prior run; and have the client mark the row `failed` with a clear message when the invoke returns 546 / `WORKER_RESOURCE_LIMIT`.
- Surface a specific message in the upload UI: "This PDF was too large to index — try splitting it into smaller files" instead of a generic error.

### Phase 5 — Guard rails

- Add an explicit size/page pre-check that fails fast with a readable message rather than dying mid-run.
- Optionally add a `page_limit`/`part` parameter so an oversized book can be ingested in several passes.

## Risks and constraints

- **Worker memory is fixed** — we cannot raise it for one function; the only lever is using less memory. If a single PDF's text alone is enormous, splitting the file remains the fallback.
- **OCR degradation**: skipping OCR on very large PDFs means scanned pages in those files won't be searchable. This is a deliberate trade for reliability.
- **Re-indexing**: after the fix, previously failed/stuck files need a re-run (the existing `reindex-course-rag` function covers this).
- **Behaviour preserved**: chunk shape, page attribution, dedupe-by-content-hash, and the supersede logic stay unchanged, so retrieval quality should not shift.
- The `Badly formatted number` warnings are benign pdfjs parser noise from the source PDF, not the cause.

## Question

Do you want OCR kept for large scanned PDFs (slower, still risky) or auto-skipped above a size threshold in favour of reliable text-layer indexing?
