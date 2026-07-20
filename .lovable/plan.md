# Chat quick-prompt update: news + course-material search

## Scope
On `/student/chat`, replace the "Compare two ideas" quick prompt with two new ones and enable real web-grounded answers for the news prompt using Gemini's `:online` variant via the Lovable AI Gateway (OpenRouter web plugin).

## 1. Quick prompts (`src/pages/student/AIChat.tsx`)
In `STUDENT_SUGGESTED_PROMPTS` (line 51):
- Remove the `GitCompare` "Compare two ideas" entry.
- Add:
  1. `Newspaper` icon — **"Explore this week's news"** — prompt: *"Show me recent news, developments, and real-world examples related to this week's topic."*
  2. `FolderSearch` icon — **"Search course materials"** — prompt: *"Find and explain information from the syllabus, textbook, slides, or other materials uploaded by my professor."*

Extend the prompt object shape with an optional `mode?: "news" | "materials"` tag so the click handler can pass a routing flag alongside the text.

## 2. Client → server flag
When the user clicks a tagged quick prompt, pass `{ mode: "news" }` (or `"materials"`) in the payload sent to the `chat` edge function alongside the message. If the user types the same words freehand, no flag is sent (default behavior).

`materials` mode is a placeholder — it sends the flag but the server treats it identically to a normal chat call for now (documented as TODO in the edge function).

## 3. `chat` edge function — news branch
In `supabase/functions/chat/index.ts`:
- Accept optional `mode` in the request body (validated, defaults to `null`).
- When `mode === "news"`:
  - Resolve the student's current visible week + concepts from the existing lesson-plan/course context already loaded by the function.
  - Build a grounded system+user prompt that includes those topics and instructs the model to: prioritize educational relevance; show publication date + source for each item; include clickable citation links; state clearly if no meaningful recent news exists and fall back to recent real-world applications.
  - Route the call to `google/gemini-2.5-flash:online` (OpenRouter web plugin — appends web search results with citations). Keep all other params identical to the existing chat call.
  - Stream the response back through the same NDJSON/SSE path used today so the UI renders it in-place (markdown + links already supported).
- Any other `mode` (including `"materials"`) → existing default chat path unchanged.

## 4. No other changes
- No DB migrations.
- No new secrets (uses existing `LOVABLE_API_KEY`).
- `materials` prompt is UI-only for this iteration; grounding on uploaded materials will be a follow-up.

## Files
- `src/pages/student/AIChat.tsx` — swap prompt list, add `mode` tag + payload wiring, import `Newspaper` / `FolderSearch` from lucide.
- `supabase/functions/chat/index.ts` — accept `mode`, add news branch using `google/gemini-2.5-flash:online` with citation-required system prompt.

## Verification
- Click "Explore this week's news" → response cites sources with dates and URLs; matches this week's concepts.
- Click "Search course materials" → sends prompt, gets standard chat answer (placeholder behavior).
- Removed prompt no longer appears; typing "compare" freehand still works normally.
