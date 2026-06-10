
# Extract Practice Question Generation into a Dedicated Edge Function

Move the practice-question system prompt and AI call out of `PracticeQuestionsWidget.tsx` and into a new `generate-practice-questions` edge function. The widget becomes a thin client that sends the student prompt and renders the parsed questions.

## Why

- Today the widget owns the system prompt, calls `/functions/v1/chat` with streaming SSE, parses SSE chunks, strips markdown fences, repairs JSON, clamps fields, and filters types. That's a lot of model-shaped logic in the UI.
- The `chat` function is a general-purpose conversational endpoint. Practice generation is structurally different: one-shot, JSON-only, no chat history, no streaming needed.
- Centralizing the prompt server-side makes it consistent with `generate-weekly-quiz`, `generate-exam-questions`, `generate-diagnostic-questions`, etc., and lets us tighten/version it without shipping a frontend build.

## Changes

### 1. New edge function: `supabase/functions/generate-practice-questions/index.ts`
- Auth: `verify_jwt = true` (default); read JWT, resolve `studentId` from `auth.uid()` (don't trust client-supplied id).
- Input (validated with Zod):
  - `prompt: string` (1..1000 chars)
  - `courseId: string` (uuid, required — must match an enrollment for this student)
  - `count?: number` (1..10, default 5)
- Reuse the existing RAG helpers' intent by re-querying `concepts` for the course and (optionally) the latest `diagnostic_results` / recent `assessment_results` to ground the prompt — same data the `chat` function already pulls, but inlined and trimmed for this one task.
- Call Lovable AI Gateway (`google/gemini-2.5-flash-lite`) non-streaming, `response_format: { type: "json_object" }` with a wrapper `{ "questions": [...] }` to make JSON parsing reliable.
- Server-side sanitize: filter to `mcq | true_false`, clamp `difficulty_estimate` to [0,1], clamp/round `bloom_level` to [1,6], coerce strings, ensure `options` length for mcq, ensure `answer` matches an option for mcq and is `"True"|"False"` for true_false.
- Return `{ questions: GeneratedQuestion[] }` as JSON.
- Standard CORS + 429/402 passthrough errors, same shape as other functions.

### 2. `src/components/PracticeQuestionsWidget.tsx` — slim down `generateQuestions`
- Replace the `fetch` to `/functions/v1/chat` + SSE parsing + JSON repair + clamp helpers with a single `supabase.functions.invoke("generate-practice-questions", { body: { prompt, courseId, count? } })`.
- Drop the system prompt constant, `clamp01`, `clampBloom`, SSE reader loop, and markdown-fence stripping (all now server-side).
- Keep the `GeneratedQuestion` type and all UI/state logic unchanged.
- Show toast on `{ error }` responses (rate-limit / credits / validation).

### 3. No DB changes, no `config.toml` changes
- `verify_jwt = true` is the default; no config block needed.
- No new tables, no new secrets (`LOVABLE_API_KEY` already present).

### 4. Out of scope
- Persisting generated questions to `assessment_questions` or a new table (still deferred; same Option A/B decision as before).
- Weekly quiz, exam, diagnostic, professor chat, `chat` function: untouched.
- Streaming the generation back to the UI (not useful — UI needs the full array before rendering).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Loss of streaming "feels fast" UX** | Practice generation already blocked on full JSON parse before rendering — streaming gave no real benefit. Keep the existing loading spinner; expected latency ~2–4s for 5 questions. |
| **Auth regression** — `chat` is currently called with the publishable key and accepts a client-supplied `studentId`; switching to `functions.invoke` + JWT changes the auth surface | Function uses `verify_jwt = true` (default) and derives `studentId` from `auth.uid()`. Verifies the student is enrolled in `courseId` before generating. Reject otherwise. |
| **Prompt injection via free-form `prompt` field** | Validate length (≤1000), strip control chars, treat as untrusted user content in the AI message (system prompt is server-owned and not user-influenced). Same posture as `chat`. |
| **Model returns malformed JSON** | Use `response_format: json_object` + wrapper `{questions: [...]}`. Server-side schema validation with Zod; on parse failure return `{ error: "Failed to generate questions" }` with 502 so the widget shows the existing toast. |
| **Model emits `short_answer` or out-of-range meta despite prompt** | Server-side filter + clamp before returning, so the widget always receives valid `mcq`/`true_false` with sane `difficulty_estimate`/`bloom_level`. |
| **Rate limits / credits exhaustion** | Pass 429 / 402 through with the same error shape the widget already expects; existing toast covers it. |
| **RAG context drift** — the `chat` function caches syllabus/concepts/questions via `cache_versions`; the new function won't share that cache | Acceptable: practice doesn't need the syllabus JSON or question bank — only concept codes + (optional) recent performance. Query directly without caching for v1; add caching only if latency proves an issue. |
| **Cold-start latency for a brand-new function** | First call may be ~500ms slower while the isolate warms. Mitigated by Lovable edge runtime keeping warm instances; not user-visible after the first invocation in a session. |
| **Coupling regression** — `AIChat.tsx` still relies on the widget's answer shape for `handlePracticeResult` | No change to `GeneratedQuestion` or `answerDetails` shape; mastery pipeline is untouched. |

## Files Touched
- `supabase/functions/generate-practice-questions/index.ts` (new)
- `src/components/PracticeQuestionsWidget.tsx` (slim `generateQuestions`, drop server-only helpers)
