# Incremental RAG Re-Ingestion

Goal: when a course PDF is replaced or re-uploaded, `rag_chunks` refreshes and retrieval only returns the latest version. A brief gap during re-embed is acceptable.

## Phase 1 — Schema

Migration on `course_material_files`:
- `content_hash text` — sha256 of PDF bytes; set by ingest function.
- `superseded_by uuid references course_material_files(id) on delete set null` — points to the replacement row.
- `superseded_at timestamptz`.
- Partial index `(course_id, folder_type) where superseded_by is null` for latest-only lookups.

Migration on `rag_chunks`:
- Add filter to `match_rag_chunks` RPC: join `course_material_files` and exclude rows where `superseded_by is not null`. Retrieval automatically ignores old versions the moment supersede is stamped.

## Phase 2 — Ingest function (`ingest-rag-document`)

1. After downloading the PDF, compute `sha256(bytes)`.
2. Read current row's `content_hash` + `rag_status`. If hash matches and status = `indexed`, short-circuit: update `rag_indexed_at = now()`, return `{ok:true, skipped:"unchanged"}`. No embed cost.
3. Otherwise run existing pipeline; on success store the new `content_hash` alongside `rag_status='indexed'`.
4. Concurrency guard: at step 1 check `rag_status`; if already `processing` and updated within last 60s, return `{ok:true, skipped:"in_progress"}` to prevent duplicate embed on double-invoke.

## Phase 3 — Same-path re-upload (already works, hardened)

The uploader path stays unchanged: `upsertCourseMaterialFile` overwrites storage, upserts the row (same `id`), invokes ingest. With Phase 2's hash check, identical bytes now skip embedding. Different bytes re-embed and delete-then-insert chunks as today (brief empty window is acceptable per your call).

## Phase 4 — Explicit "Replace" action

New helper `replaceCourseMaterialFile({ oldFileId, newUpload })`:
1. Upload new file to storage at a new path (e.g. `.../<uuid>-<name>.pdf`).
2. Insert a new `course_material_files` row (new `id`, same `course_id`/`folder_type`/`teacher_id`).
3. Stamp old row: `superseded_by = <newId>`, `superseded_at = now()`. Retrieval instantly stops using the old chunks (via updated RPC filter).
4. Invoke `ingest-rag-document` on the new row.
5. Background cleanup (either same call or a `cleanup-superseded-rag` function): once new row is `indexed`, delete old storage object + old `course_material_files` row (chunks cascade). Kept as separate step so failed ingest of the new file doesn't lose the old copy.

UI wiring:
- Add a "Replace" button next to each file row in `ContentLibrary.tsx` (and `CourseMaterials.tsx` list). Opens the existing file picker, calls `replaceCourseMaterialFile`. No design changes beyond one icon-button per row.

## Phase 5 — Similar-name auto-supersede (guarded)

When `upsertCourseMaterialFile` creates a NEW row (not an upsert hit), after insert scan same `course_id + folder_type` for another non-superseded row where `lower(regexp_replace(file_name,'[_\\-\\s.]?v?\\d+',''))` matches the new name's normalized stem. If exactly one match, mark it `superseded_by` the new row. If zero or many matches, do nothing (avoid wrong supersedes). Log both branches to `setup_progress_log` for auditability.

Opt-out: skip this heuristic entirely for `folder_type in ('syllabus-json','lesson-plan-draft','lesson-plan-published')` — those are already unique-per-course.

## Phase 6 — Tests

- Deno: hash short-circuit, concurrency-guard branch, supersede filter honored by `match_rag_chunks`.
- Vitest: `replaceCourseMaterialFile` supersede ordering (new row indexed → old row deleted; failure path keeps old row intact).

## Risks & constraints

- **Race between supersede flip and old-row delete**: mitigated by only deleting the old row after new row's `rag_status='indexed'`.
- **RPC signature change**: `match_rag_chunks` gains an implicit filter; no callers pass a "include superseded" flag, so this is backwards-compatible for reads.
- **Similar-name heuristic false positives**: strictly single-match-only + logging; teachers still have Delete/Replace to correct.
- **Hash mismatch across identical PDFs from different exporters**: acceptable — a different byte stream is treated as new content.
- **PDF > memory**: unchanged from today; hashing streams the same buffer already loaded.
- **`rag_chunks.course_id` denormalized**: supersede filter must join `course_material_files`, adding a small cost to the RPC — negligible at K=5.

## Out of scope

Chunk-level diffing (partial re-embed) and version history browsing for teachers.