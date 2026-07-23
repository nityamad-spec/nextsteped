# Fix raw `[[published-plan.json #1]]` citation tokens in TA chat

Today, the grounding prompt tells the model to cite inline as `[<file_name> #<chunk_index>]`, but the model often emits `[[file #N]]` and those tokens render verbatim in the chat bubble. We'll transform them into footnote-style superscripts (¹ ² ³) with a Sources list at the bottom of the message. Applies to all RAG citations (PDFs and lesson-plan JSON).

## Phase 1 — Prompt: cleaner citation contract (edge function)

File: `supabase/functions/_shared/chat-grounding.ts`

- Change the GROUNDING RULES so the model:
  - Cites inline **only** as `[[n]]` where `n` is 1-based index of the excerpt as listed in COURSE MATERIALS.
  - Never repeats file names or chunk indices inline.
- Change the excerpt block header so each excerpt is prefixed with `[[n]]` and its human-readable label (see Phase 2 label rules), so the model has a stable numeric anchor to cite.

## Phase 2 — Emit structured sources with the response (edge function)

File: `supabase/functions/chat/index.ts` (+ helper in `chat-grounding.ts`)

- Build a `sources` array from the retrieved chunks in the order they appear in the grounded prompt:
  ```
  { n, file_name, folder_type, page_start, page_end, chunk_index, label }
  ```
- `label` rules (all citations covered):
  - `folder_type === 'lesson-plan-published'` → `"Lesson Plan — Week {page_start}"` (or `"Lesson Plan — Overview"` when `page_start === 0`).
  - PDF with pages → `"{friendlyName}, p.{page_start}[-{page_end}]"`.
  - Otherwise → `"{friendlyName}"`.
  - `friendlyName` strips extension and replaces `-`/`_` with spaces; `published-plan.json` → `"Lesson Plan"`.
- Return `sources` in the JSON response envelope alongside the assistant text; persist it on the message via the existing `metadata` jsonb column (`metadata.sources`).
- Fallback / general-knowledge branches return `sources: []`.

## Phase 3 — Client renderer: footnotes + Sources list

Files: `src/pages/student/AIChat.tsx`, `src/pages/teacher/TeacherChat.tsx`, and a new shared util `src/lib/renderCitations.ts`.

- Add `renderCitations(content, sources)` that:
  1. **Prompt-compliant path** — replaces `[[n]]` with a superscript `<sup>n</sup>` linked to the sources list.
  2. **Legacy/retroactive path** — regex-matches `[[<file> #<idx>]]` and `[<file> #<idx>]` tokens, maps each unique `(file, idx)` to a footnote number, and rewrites inline. Used both for old stored messages and for any new response where the model ignored the new prompt.
  3. Deduplicates repeated citations to the same source into one footnote number.
  4. Returns `{ transformedContent, footnotes: [{n, label}] }`.
- Update `renderMessage` in both chat pages:
  - Feed `transformedContent` through `ReactMarkdown` (`sup` renders natively).
  - Below the markdown, render a compact `Sources` list (small muted text) when `footnotes.length > 0`. Skip when the message has the general-knowledge badge.
- Keep the existing `[[NEEDS_FALLBACK]]` / `[[GENERAL_KNOWLEDGE]]` handling untouched — those sentinels are stripped before `renderCitations` runs.

## Phase 4 — Verify

- Deno test extending `chat-grounding_test.ts`: assert new prompt/format + `sources` builder output for PDF and lesson-plan chunks.
- Vitest for `renderCitations`: covers prompt-compliant `[[n]]`, legacy `[[file #N]]`, dedupe, and no-citation passthrough.
- Manual: ask a teacher-chat question that hits a lesson-plan chunk and a PDF chunk; confirm superscripts render and Sources list appears with the friendly labels.

## Risks / constraints

- **Retroactive rendering** — old stored assistant messages contain raw tokens with no `metadata.sources`. The legacy regex path still produces friendly labels from the token itself (`published-plan.json #1` → `"Lesson Plan — Week 1"` when `folder_type` is inferable from filename; otherwise falls back to file name). No DB migration required.
- **Model compliance** — Gemini may still emit the old bracket style occasionally; the client legacy parser is the safety net, so UX stays clean either way.
- **Chunk-index vs. week number** — for lesson-plan JSON, `chunk_index` is not the week number, but `page_start` is (set in `buildLessonPlanChunks`). The label builder uses `page_start`, not the raw token's `#N`, when `metadata.sources` is present. Legacy path (no metadata) can only show the raw index; acceptable for backward messages.
- **No UI framework changes** — pure additions in the two chat pages and one shared util; no new components required.

## Out of scope

- Clickable citations that open the source PDF/lesson week (would need a viewer route).
- Backfilling old messages with structured `metadata.sources`.
