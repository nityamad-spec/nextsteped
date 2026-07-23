# Lesson-Plan JSON RAG Ingestion

Extends the existing RAG pipeline to cover published lesson plans so TA Chat can ground answers on week overviews, concepts, and resources.

## Scope

- Trigger only when a teacher publishes the full plan (draft saves untouched).
- One chunk per week, plus a small course-level header chunk.
- Reuse `ingest-rag-document` (add a JSON branch) and `rag_chunks` schema — no new tables.
- Backfill existing published plans via a one-off script that invokes the ingest function per course.

## Phase 1 — Extend `ingest-rag-document` with a JSON branch

Detect JSON by extension **or** `folder_type = 'lesson-plan-published'` before the current PDF gate:

- Download the JSON from `course-materials`.
- Content-hash short-circuit stays: SHA-256 the raw bytes, skip if unchanged and already indexed.
- Parse via `JSON.parse` → normalize with `normalizeLessonPlan` (already handles both shapes).
- Build chunks:
  - **Header chunk** (`chunk_index = 0`): course title/code + overall course learning outcomes (when present) + a compact index of "Week N — topic" lines.
  - **One chunk per week** (`chunk_index = 1..N`): plain-text block containing `Week {N} — {topic}`, exam-week flag if true, overview/description, `Concepts:` bullet list (name — brief), `Resources:` bullet list (type — title — description/url). Keep under ~2000 chars; if a single week overflows, split at concept/resource boundary and share the same `page_start = page_end = weekNumber` so citations stay week-scoped.
- Set `page_start`/`page_end` to the week number (0 for header) so retrieval citations render as "Week 3".
- Embed via existing `embedBatch` (google/gemini-embedding-001), reuse existing insert path — delete-then-insert by `file_id` keeps re-publishes idempotent.
- Mark `rag_status = 'indexed'`, `content_hash`, `rag_indexed_at`.

PDF path is unchanged; OCR/unpdf code is not exercised for JSON.

## Phase 2 — Fire on Publish only

In `src/pages/teacher/TeachingPlan.tsx`'s `handlePublish` path, after `upsertCourseMaterialFile({ folder_type: 'lesson-plan-published', ... })` succeeds:

- `upsertCourseMaterialFile` already invokes `ingest-rag-document` for `.pdf` files. Loosen its `fireIngest` in `src/lib/courseMaterialFiles.ts` to also fire when `folder_type === 'lesson-plan-published'` (keep the `.pdf` rule for other folders).
- No draft-save changes. `lesson-plan-draft` and `syllabus-json` remain excluded from RAG.

## Phase 3 — Backfill script (one-off, run once)

Add `scripts/backfill-lesson-plan-rag.ts` (Deno) as part of this build:

- Iterate all courses with `lesson_plan_path IS NOT NULL`.
- For each, look up the `course_material_files` row where `folder_type = 'lesson-plan-published'` and `storage_path = lesson_plan_path`; if missing, `upsert` it so a `file_id` exists.
- Invoke the `ingest-rag-document` edge function with that `file_id` (bounded concurrency = 3, matching `reindex-course-rag`).
- Log per-course result (chunks written / skipped / error). Print a final summary.
- Run once from the sandbox after deploy; not wired into any UI.

## Phase 4 — Verify

- `psql` check that `rag_chunks` now contains rows with `folder_type = 'lesson-plan-published'` for each course that had a published plan.
- Spot-check retrieval via a TA Chat query that references a week concept and confirm the citation resolves to the correct week.

## Risks & Constraints

- **Duplicate published-plan rows**: some courses may have multiple historical `lesson-plan-published` files. Backfill only ingests the row matching `lesson_plan_path` (current published path) to avoid stale chunks. Older rows keep whatever `rag_status` they already have.
- **JSON shape drift**: `normalizeLessonPlan` already handles legacy and new shapes; if parse fails the ingest run marks `rag_status = 'failed'` with the error message, same as PDFs.
- **Cache invalidation**: `bumpCacheVersion` is not called here — the shared `retrieveContext` reads live from `rag_chunks`, so newly indexed weeks are visible on the next chat turn.
- **Citation format**: existing prompt cites `[<file_name> #<chunk_index>]`. For published-plan.json that reads as `[published-plan.json #3]`. Acceptable for this phase; a nicer "Week 3" label is a follow-up if needed.
- **No UI changes** — matches your instruction.

## Files touched

- `supabase/functions/ingest-rag-document/index.ts` — JSON branch + week chunker.
- `src/lib/courseMaterialFiles.ts` — allow `fireIngest` for lesson-plan-published JSON.
- `scripts/backfill-lesson-plan-rag.ts` — new one-off backfill.
