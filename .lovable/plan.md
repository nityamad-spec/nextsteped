## Why there's no progress bar on `/teacher/setup/upload`

Verified against the current code:

- `**FileUploadZone.tsx` uses `supabase.storage.from(...).upload(file)**`, which is a `fetch`-based call with no `onUploadProgress` hook. During upload it only flips a boolean `uploading` state — there is no byte-level % to render, so nothing draws a bar.
- **Ingestion runs fire-and-forget.** After the row lands in `course_material_files`, `ingest-rag-document` runs on the edge and writes `rag_status` (`pending` → `processing` → `indexed` / `failed` / `skipped`). `FileUploadZone` never reads `rag_status`, so users see no indexing feedback in the setup step.
- **Only the syllabus has a rich timeline.** The substep progress bar you may have seen is hardcoded to `folderType === "syllabus"` (drives `PARSE_SUBSTEPS` for `parse-syllabus`). Textbooks, materials, lesson-plans, YouTube-links all share the same component but hit none of that code path.
- `**ContentLibrary.tsx` already polls `rag_status` every 3s and renders Indexing / Indexed / Failed badges** — but that view is separate from the setup step, so the setup upload cards don't benefit.
- `**CourseMaterials.handleNext()` doesn't check `rag_status`.** The Next button is only gated on syllabus parse completion, so users can navigate away mid-embed.

Net effect: uploads look "done" the moment the storage PUT resolves, and RAG ingestion happens invisibly in the background.

## Proposed plan — add upload + ingestion progress and gate navigation

### Phase A — Real upload % bar

Replace `supabase.storage.upload(...)` inside `FileUploadZone.handleConfirmedUpload` with a signed-upload-URL + `XMLHttpRequest` path so we can attach `xhr.upload.onprogress` and expose per-file `{ loaded, total }`. Render a `<Progress value={pct}/>` row per pending file while `uploading` is true. Keep the existing `supabase.storage` fallback if signed-upload URL creation fails, so we degrade to an indeterminate spinner rather than break.

### Phase B — Post-upload "Indexing…" progress in the setup step

After upload resolves, keep each new file in a local `ingestingPaths` set inside `FileUploadZone`. Poll `course_material_files.rag_status` (and `rag_error`) every 3s for those rows — same query pattern as `ContentLibrary.tsx`, extracted into a small `useRagStatus(fileIds)` hook so both call sites share it. For each row render one of:

- `Uploading…` with the real % from Phase A
- `Indexing… (page X of Y)` — indeterminate `<Progress>` bar; text pulled from `rag_status='processing'`. Optional stretch: have `ingest-rag-document` write a `rag_progress` int column (`0..100`) after each embed batch so the bar can be determinate. Flag as an optional follow-up because it needs a migration + edge-function write; not required to ship a working bar.
- `Indexed` ✓ / `Failed — <error>` / `Skipped`

### Phase C — Gate "Next" until ingestion settles

In `CourseMaterials.tsx`, lift the per-zone "any file still pending/processing?" flag via a new `onIngestStatusChange` callback on `FileUploadZone` (mirrors the existing `onParseStatusChange` pattern). `handleNext` disables while any zone reports in-flight ingestion, with tooltip: "Waiting for X file(s) to finish indexing." Failed files do **not** block Next (user can retry from Content Library), but they surface a warning banner.

Also block the "Upload" button on the same card from accepting *new* pending files while an existing upload+ingest is still running for that card, so users can't queue on top of an in-flight batch.

### Phase D — Shared component + unit tests

- Extract `RagStatusBadge` (already inline in `ContentLibrary.tsx`) into `src/components/RagStatusBadge.tsx` so both `ContentLibrary` and `FileUploadZone` render the same badge/copy.
- Add a `useRagStatus(fileIds)` hook with the polling logic.
- Tests: mock `supabase.storage` XHR path for progress events; verify Next disables while any status is `processing`; verify badge transitions.

### Risks / constraints

- **Supabase JS upload has no progress event.** Signed-upload-URL + XHR works but the auth flow is a two-call round-trip; failure needs a graceful fallback.
- **Ingest can legitimately take minutes** for a 30 MB / 1500-page PDF with OCR. Gating Next on completion is UX-correct but may frustrate users on slow PDFs — mitigation: show ETA text ("Large PDFs can take a few minutes") and allow explicit "Skip for now — I'll finish later" that leaves `rag_status='processing'` in place.
- **Poll load.** Multiple upload cards each polling every 3s → keep to a single hook that batches all `fileIds` into one query.
- **Determinate ingest %** requires a schema change (`rag_progress int`) and edge-function writes. Deferred to an optional Phase B.2 unless you want it in the first pass.

### Questions before I start

1. Should Next be blocked **only while `processing**`, or also while `pending` (queued but the function hasn't started)? I'd default to both.
2. Do you want determinate ingest progress (Phase B.2 migration + edge function writes) in this round, or is an indeterminate "Indexing…" bar with a live "X of Y indexed" file counter enough? No
3. Same question for the Syllabus card — replace its bespoke substep timeline with the unified upload+ingest bar, or leave it alone? yes
4. On failed ingestion, block Next or let the user proceed with a warning? (I'm suggesting proceed-with-warning.) proceed with a warning