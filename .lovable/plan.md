
# Plan: Ground TA Chat with RAG + General-Knowledge Fallback

Grounds student Study, student Exam Prep, and teacher Course Assistant chat on `rag_chunks` from the course's uploaded materials. All existing context (mastery, class snapshot, syllabus JSON, professor guidance, safety rules, exam prompt) stays intact — RAG is added as an additional context block. When retrieval is insufficient, the assistant offers a one-tap fallback that answers from general knowledge and stamps the reply with a badge.

## Phase 1 — Edge function: retrieval + grounding

File: `supabase/functions/chat/index.ts`

1. New request fields (backward compatible):
   - `grounding`: `"rag"` (default for study/exam/teacher when `courseId` present) or `"general"` (fallback path).
   - Reuse the existing `mode`, `courseId`, `studentId`, `messages`.
2. When `grounding === "rag"` and `courseId` present:
   - Take the last user message as the query.
   - Call `retrieveContext({ courseId, query, topK: 5 })` from `_shared/rag-retrieve.ts` with all folders (no `folderTypes` filter).
   - Compute `topSim = max(chunks[].similarity)`.
   - Threshold: `RAG_MIN_SIMILARITY = 0.62` (tunable const).
   - If `chunks.length === 0` OR `topSim < RAG_MIN_SIMILARITY`:
     - Return a **non-streamed** JSON sentinel `{ needs_fallback: true, reason, top_similarity }` with 200 status. UI catches this and renders the Yes/No prompt (no tokens billed for a full LLM turn).
   - Else: append a `COURSE MATERIALS (grounded excerpts)` block to `fullSystemPrompt` using `formatPrompt(chunks, query).user` context (adapted so it complements the existing system prompt rather than replacing it) and add rules:
     - "Answer primarily from the excerpts. Cite `[<file_name> #<chunk_index>]` inline for factual claims drawn from them."
     - "If the excerpts don't cover the question, end your reply with the exact token `[[NEEDS_FALLBACK]]` on its own line — do not guess."
   - Keep all other prompt sections (mastery, safety, exam mode, professor guidance) unchanged.
3. When `grounding === "general"`:
   - Skip retrieval. Append a short "GENERAL KNOWLEDGE MODE" block instructing the model to answer from general knowledge, keep it aligned with the course topic, and prefix its response with the marker `[[GENERAL_KNOWLEDGE]]` (used by UI to render badge; stripped before display).
   - All safety, tone, mastery, and exam rules still apply.
4. Cache-control: retrieval results are per-question and not cached (query-dependent). The existing `ragCache` for syllabus/concepts/mastery is untouched.
5. Cost guard: skip retrieval when the trimmed user message length < 4 chars or when `mode === "exam"` and `examSystemPrompt` explicitly disables it (kept as an env-independent constant, defaults on).

## Phase 2 — UI: fallback prompt + badge

Files: `src/pages/student/AIChat.tsx`, `src/pages/teacher/TeacherChat.tsx`.

1. When calling `/functions/v1/chat`, send `grounding: "rag"` by default.
2. Before streaming, `fetch` returns either:
   - a JSON body with `needs_fallback: true` → render an inline assistant message:
     > "I couldn't find this in the course materials. Would you like me to answer from general knowledge?"
     with two buttons **Yes, use general knowledge** / **No, thanks**. Message stays in transcript; clicking Yes re-sends the same last user query with `grounding: "general"` and streams the reply.
   - a normal SSE stream → stream as today. After completion, if the accumulated text starts with `[[GENERAL_KNOWLEDGE]]`, strip the marker and attach `variant: "general_knowledge"` on the stored message. If text ends with `[[NEEDS_FALLBACK]]`, strip it and append the same Yes/No prompt underneath.
3. Persisted message shape (`ChatMessage`) gets an optional `variant?: "grounded" | "general_knowledge" | "fallback_prompt"` and optional `pendingQuery?: string` (for fallback_prompt rows). Stored in the existing `metadata` JSONB of `chat_messages` — no schema migration needed (add JSONB column read/write via `useChatSessions`).
4. Rendering:
   - `general_knowledge` messages get a small badge next to the avatar: `AI general knowledge` (uses shadcn `<Badge variant="outline">` with an `Info` icon). Grounded replies show no badge (default).
   - Fallback-prompt messages render two shadcn Buttons; disable after click.
5. `useChatSessions` extended to persist/rehydrate `variant` and `pendingQuery` from the `metadata` column so a page reload preserves badges and the pending fallback prompt.

## Phase 3 — Verification

1. Manual: ask a course-covered question → verify inline citations + no badge; ask an unrelated question → verify fallback prompt renders; click Yes → verify streamed reply carries `AI general knowledge` badge; click No → prompt dismissed.
2. Repeat in Exam Prep mode and Teacher Course Assistant.
3. Reload page mid-conversation → verify badges and fallback prompt buttons rehydrate.
4. Confirm existing behaviors intact: mastery context, safety redirects, exam-mode prompt, professor guidance appended.

## Risks / constraints

- **Similarity threshold tuning.** 0.62 is a starting point on cosine similarity of `gemini-embedding-001` halfvec; may need to raise/lower after real testing. Kept as a single constant to tune later.
- **Model can ignore the `[[NEEDS_FALLBACK]]` instruction** and hallucinate. Threshold-based early exit is the primary guard; sentinel is the safety net (as you selected "Both").
- **Citations quality** depends on chunk metadata already stored — verified working in the recent ingestion test.
- **Extra latency**: adds one embedding call (~150-300ms) + one RPC per user turn. Acceptable for chat; not cached because queries are unique.
- **Cost**: each user message = 1 embedding + up to 1 LLM completion. Fallback flow costs 1 additional LLM completion only when user opts in.
- **`chat_messages.metadata` column**: need to confirm it exists; if not, Phase 2 adds a lightweight migration (`ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb`) — will flag before applying.
- **Exam mode** currently uses a professor-supplied prompt that may already restrict the AI. RAG grounding is additive; if a course has no uploaded materials, retrieval returns 0 chunks and every question falls through to the fallback prompt — acceptable and correct behavior.

## Out of scope

- Changing chunking, embedding model, or ingestion pipeline.
- Streaming citations as rich source cards (kept as inline text `[file #chunk]` for now).
- Per-mode folder filtering (all folders used everywhere, per your selection).
