# Fix: TA can't answer syllabus / lesson-plan questions

## What I verified

Indexing is healthy — this is a retrieval problem, not an ingestion one.

- Every affected course has chunks for both document types, all joined to live (non-superseded) file rows: CL01 18 chunks, CL02 21, CL03 22, each with `syllabus` + `lesson-plan-published`.
- Corpus-wide: 101 syllabus chunks, 166 lesson-plan chunks, 22 lesson-plans — zero orphaned, zero superseded.
- `match_rag_chunks` returns the right rows structurally; nothing filters these folder types out.

## Root cause

The failing questions are **document-level ("meta") questions**, not content questions:

1. "summarise the syllabus"
2. "what's the lesson plan"
3. "what topics are covered in unit 2"

The chat function embeds the raw question and keeps the single best chunk's cosine similarity. A short meta-question shares almost no wording with the *body* of a syllabus page or a week's overview, so the top similarity lands below the hard `SIM_THRESHOLD = 0.62` gate in `_shared/chat-grounding.ts`. The moment that happens the function returns `needs_fallback` and answers nothing from materials — exactly the prompt you're seeing.

Four compounding factors:

| # | Factor | Effect |
|---|---|---|
| 1 | Single hard cutoff on the top chunk (0.62) | All-or-nothing; a 0.58 match is discarded even though it is the right document |
| 2 | Pure dense vectors, `topK: 5`, no folder scoping | "unit 2" / "week 3" are exact tokens vectors match poorly; lesson-plan chunks (166) can crowd out syllabus chunks (101) and vice versa |
| 3 | No meta-query routing | "summarise the syllabus" needs *the whole syllabus*, not the 5 nearest chunks |
| 4 | Model-side `[[NEEDS_FALLBACK]]` escape | A second refusal path even when good chunks were retrieved |

## The fix (3 phases)

### Phase 1 — Retrieval quality: hybrid search + calibration

- Add a Postgres full-text (`tsvector`) column and GIN index on `rag_chunks.content`, plus a `match_rag_chunks_hybrid` RPC that fuses dense-vector and keyword hits with Reciprocal Rank Fusion. This is what makes "unit 2", "week 3", "grading", named module titles work reliably.
- Raise `topK` from 5 to 8 and diversify: guarantee at least 2 slots for each folder type present in the fused result, so syllabus and lesson-plan can't crowd each other out.
- Replace the single 0.62 cutoff with two levels: a **confident** floor and a lower **weak-evidence** floor. Below the weak floor only, we fall back.
- Add structured logging of query, per-chunk similarity, fused rank and the decision taken, so the thresholds can be tuned from real traffic instead of guesswork.

### Phase 2 — Intent routing for meta questions

Add a lightweight classifier (regex-first, no extra model call for the common cases) in a new `_shared/rag-intent.ts` that detects:

- **Syllabus meta** ("summarise the syllabus", "what's in the syllabus", grading, attendance, textbooks, assessment policy) → retrieve the whole syllabus document (18-25 chunks — well within a single prompt) instead of top-K.
- **Lesson-plan meta** ("what's the lesson plan", "course outline", "what's the schedule") → retrieve the lesson-plan overview plus every week header.
- **Unit/week-scoped** ("what topics are covered in unit 2", "week 4") → parse the number and retrieve that week's lesson-plan chunks directly by `page_start`, merged with hybrid hits.

These routes bypass the similarity gate entirely: if we know which document answers the question, low cosine is irrelevant.

Also widen the `classify-question` relevance gate so administrative course questions (grading policy, exam dates, attendance, textbook list) are never classified `off_topic`.

### Phase 3 — Graceful fallback

Replace the binary refusal with your chosen behaviour:

- **Confident evidence** → answer with `[[n]]` citations, as today.
- **Weak evidence** → still answer from the retrieved excerpts, with a short "this is my best read of your course materials, confidence is low" note plus citations, and offer the general-knowledge opt-in alongside it rather than instead of it.
- **No evidence at all** → current general-knowledge opt-in prompt, unchanged.

Remove the model-side `[[NEEDS_FALLBACK]]` escape for the weak tier so the model can no longer refuse content we deliberately handed it; keep it only for the empty tier.

## Technical detail

Files touched:

- `supabase/migrations/*` — `content_tsv` generated column + GIN index on `rag_chunks`; new `match_rag_chunks_hybrid(_course_id, _query_embedding, _query_text, _match_count, _folder_types)` RRF RPC, `SECURITY DEFINER`, `search_path=public`, granted to `service_role` only (called from edge functions). Existing `match_rag_chunks` is left intact so nothing else breaks.
- `supabase/functions/_shared/rag-retrieve.ts` — `retrieveContext` gains hybrid mode, folder diversification and direct document/week fetch helpers (`fetchWholeDocument`, `fetchWeekChunks`).
- `supabase/functions/_shared/rag-intent.ts` (new) — meta/unit intent detection, pure and unit-tested.
- `supabase/functions/_shared/chat-grounding.ts` — three-tier confidence (`confident` / `weak` / `none`), tier-specific grounding instructions, `confidence` returned to the client.
- `supabase/functions/chat/index.ts` — route on intent, call hybrid retrieval, return `{ confidence, sources }` instead of a bare `needs_fallback` for the weak tier.
- `supabase/functions/classify-question/index.ts` — administrative/syllabus questions treated as on-topic.
- `src/pages/student/AIChat.tsx`, `src/pages/teacher/TeacherChat.tsx` — render the low-confidence notice with citations plus the existing general-knowledge opt-in.

Tests: extend `chat-grounding_test.ts` and `rag-retrieve_test.ts`, add `rag-intent_test.ts` covering the three failing questions plus week/unit parsing (`unit 2`, `Unit-2`, `week 4`, `wk 4`).

## Risks and constraints

- **Threshold values are currently unmeasured.** I could not run a live embedding comparison in plan mode. Phase 1's logging lands first so the two floors are set from observed data; until then they are conservative estimates and may need one tuning pass.
- **`unit` vs `week` are not the same thing in every course.** The lesson plan is stored per week (`page_start` = week number). If a course's units span multiple weeks, "unit 2" maps ambiguously — I'll fall back to hybrid search when the number can't be resolved to a week, rather than answering from the wrong week.
- **Whole-document retrieval grows the prompt.** ~20 syllabus chunks is fine; a large textbook is not. Meta-routing is restricted to `syllabus` and `lesson-plan-published` folder types, with a hard chunk cap.
- **Answering on weak evidence trades refusals for occasional imprecision.** Mitigated by mandatory citations and the visible low-confidence note.
- The migration only adds a column, an index and a new function — no data rewrite, no re-embedding, no downtime.
