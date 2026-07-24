# Fix: uploaded PDFs stuck on "Indexing…"

## Root cause

`FileUploadZone.handleConfirmedUpload` (src/components/FileUploadZone.tsx, ~lines 511-525) registers the newly uploaded file by calling `supabase.from("course_material_files").insert(...)` **directly**. That skips the shared helper `upsertCourseMaterialFile()` in `src/lib/courseMaterialFiles.ts`, which is the only place that fires the ingest edge function (`fireIngest → supabase.functions.invoke("ingest-rag-document")`).

Consequence:

- Row is created with the DB default `rag_status = 'pending'`.
- `ingest-rag-document` is never invoked (edge-function logs show zero calls; the row's `rag_status` stays `pending`, `rag_error` stays `null`, `rag_indexed_at` stays `null` — the function never even reached the "processing" write).
- `useRagStatus` keeps polling `pending` forever → "Indexing…" badge never clears.

This explains the current stuck file `Introduction of Finite Automata - GeeksforGeeks.pdf` (id `fc1e2c1d…`) and any past-materials / lesson-plan / textbook PDF that was uploaded through the standard uploader after this code path landed. The 19 already-indexed rows came from the earlier backfill / from the syllabus + Replace paths (both of which do go through `upsertCourseMaterialFile`).

Nothing on the backend is broken — the edge function, embedding pipeline, and DB are fine. It's purely a missing client-side trigger.

## Fix (one file, one call)

Replace the direct insert inside the upload loop with a call to the shared helper, so every successful storage upload gets registered and immediately triggers `ingest-rag-document`.

**File:** `src/components/FileUploadZone.tsx`

Around lines 511-525, swap:

```ts
const { error: metaError } = await supabase
  .from("course_material_files")
  .insert({ teacher_id, course_id, file_name, file_size, storage_path, folder_type });
```

for:

```ts
if (teacherId && courseId && folderType) {
  await upsertCourseMaterialFile({
    course_id: courseId,
    teacher_id: teacherId,
    storage_path: filePath,
    file_name: file.name,
    file_size: file.size,
    folder_type: folderType,
  });
}
```

Notes:

- `upsertCourseMaterialFile` already:
  - upserts on `(course_id, storage_path)` (safe on retries),
  - runs the same-stem auto-supersede check,
  - and calls `fireIngest`, which only invokes for `.pdf` files or `lesson-plan-published` folder (matches current expectations — JSON drafts/syllabus stay skipped as before).
- `courseId` is currently optional in the raw insert (`course_id: courseId ?? null`). We should require it before firing ingest to avoid orphan rows the edge function can't attribute. If `courseId` is missing, fall back to the current raw insert (or skip entirely) to preserve existing behavior for non-course uploaders.

## Backfill the currently stuck row

After the code change, kick the one visibly-stuck PDF once so the user's current file finishes indexing without a re-upload:

- Invoke `ingest-rag-document` with `{ file_id: "fc1e2c1d-a7c3-4229-b480-7c7837bdcc7f" }`.
- The 9 stale `approved-syllabus.json` / `draft-plan-v2.json` rows in `pending` are intentional (their folder types are excluded from ingest) — leave them; if the badge annoyance matters we can flip their status to `skipped` in the same pass, but that's optional and separate from this bug.

## Verification

1. Upload a new PDF into any folder (past materials, lesson plans, textbook).
2. Watch `course_material_files.rag_status` transition `pending → processing → indexed` within a few seconds.
3. Confirm edge-function logs for `ingest-rag-document` show a fresh invocation.
4. Confirm the "Indexing…" badge clears and switches to "Indexed" via the existing `useRagStatus` polling.

## Risks

- **Existing raw-insert behavior with `course_id: null`.** Some historical call sites may rely on being able to upload without a course context. Guarding on `courseId` preserves that path.
- **Double-fire on retries.** `upsertCourseMaterialFile` is idempotent (upsert on path), and `ingest-rag-document` short-circuits on unchanged `content_hash`, so re-invocations are safe.
- **No new permissions or migrations.** Pure client change plus one manual ingest for the stuck row.

## Questions before I implement

1. **Backfill scope:** just the one visibly-stuck file (`Introduction of Finite Automata…`), or should I also scan for any other `pending` PDF rows created since the FileUploadZone regression landed and re-fire them in one pass? Yes do it for all pdf rows
2. **Stale JSON rows (`approved-syllabus.json`, `draft-plan-v2.json`) sitting in `pending`:** leave as-is, or flip their `rag_status` to `skipped` so the admin data model reflects reality? (No UI impact — they don't appear in the uploader badge list.) change status to skipped
3. **Missing `courseId` guard:** if a caller ever mounts `FileUploadZone` without a `courseId`, do you want the upload to still register (raw insert, no ingest) or be refused outright? refuse upload when there is no course id