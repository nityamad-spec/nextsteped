# Ground question generation in the course's own materials

Today the diagnostic, weekly quiz, practice, and exam generators write questions from concept names alone. The course's uploaded documents are already indexed for the assistant, but the generators never look at them. This plan puts one shared retrieval step in front of all four so questions are written from what was actually taught, and records the source document and page for each question.

## What changes for people

- Questions read like they came from this course: same terminology, same examples, same depth as the material.
- When reviewing questions, a professor sees which document and page each question came from.
- Courses with nothing uploaded keep working exactly as they do now — generation just falls back to the current behaviour.

## Approach

One shared retrieval module used by all four generators, so material is fetched once per generation run and reused across every batch and every follow-up pass — no repeated lookups per concept or per batch.

### 1. Shared module: `_shared/generation-context.ts`

A single function that takes a course, an optional week, and the list of concept codes in play, and returns a ready-to-embed context block plus the list of sources behind it.

- Runs one bundled retrieval over the course library, drawing on teaching materials, syllabus, and lesson plan (all uploaded folder types), reusing the existing hybrid search and per-folder diversification in `_shared/rag-retrieve.ts`.
- Concept codes are combined into the retrieval query, then results are grouped back per concept so each concept gets its own labelled excerpt group; concepts with no match are simply absent.
- Caps total context size (character budget, trimmed longest-first) so prompts stay within model limits regardless of course size.
- Returns `{ contextBlock, sources, byConcept }` where `sources` is a de-duplicated list of `{ file_id, file_name, page_start, page_end, chunk_index }`.
- Returns an empty context when the course has no indexed chunks; every caller treats that as "generate as before".

Unit tests cover grouping, the character cap, and the empty-library case.

### 2. Wire into the four generators

For `generate-diagnostic-questions`, `generate-weekly-quiz`, `generate-practice-questions`, `generate-exam-questions`:

- Fetch the context once at the start of the request (before batching / tier loops) and pass it down to the existing batch functions.
- Insert a `COURSE MATERIAL EXCERPTS` section into each system prompt, above the concept list, with instructions: prefer the material's terminology, notation, and worked examples; do not contradict it; do not quote long passages verbatim; if a concept has no excerpt, write from the concept name as before.
- Ask the model to return, per question, the source label it drew on (one of the labels shown in the excerpt block). Unrecognised labels are dropped during validation rather than rejecting the question.
- No change to existing validation, quota, dedup, or scoring logic.

Weekly quiz additionally restricts retrieval to that week's lesson-plan scope where week data exists; exam generation restricts to the revealed weeks it already computes.

### 3. Store and show the source

- Migration adds `source_refs jsonb` (nullable) to `public.assessment_questions` and `public.diagnostic_questions`, with grants unchanged (columns only, no new tables).
- Generators write the resolved source list per question; null when ungrounded.
- `ExamQuestionsViewDialog.tsx` and the exam-mode question list show a small "Source: <file name>, p. N" line under each question, hidden when absent.

## Technical notes

- Reuses `retrieveContext` / `fetchDocumentChunks` in `_shared/rag-retrieve.ts` and the existing `match_rag_chunks_hybrid` RPC; no new retrieval infrastructure.
- One embedding call and one RPC per generation run, not per concept or per batch.
- Retrieval failures are caught and logged, then treated as an empty library, so generation never fails because of retrieval.
- Regenerated types after the migration; existing rows keep `source_refs = null`.
