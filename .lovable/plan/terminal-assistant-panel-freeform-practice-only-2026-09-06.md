# Terminal Assistant Panel (Freeform Practice Only)

Add an integrated AI chat assistant panel to the code terminal on `/student/chat`, alongside the existing editor and output panes. The assistant sees the student's current code, language, and latest output, coaches with Socratic hints (never writes solutions), and is only available in freeform practice — never during exercises or any graded assessment.

## Confirmed requirements
- **Full context**: each message automatically includes current editor code, selected language, latest output, and the unit's concept names.
- **Socratic style**: hints, guiding questions, error explanations — no complete solutions or corrected code.
- **Freeform practice only**: panel appears only in the freeform practice terminal (`?terminal=1&...&freeform=1`). Exercise sessions (opened with a problem statement) and all assessment views (quiz/exam/diagnostic) get no assistant.
- **Saved to chat history**: conversations persist per student + course so they can be revisited later.

## Phase 1 — Backend: `terminal-assistant` edge function
- New lightweight edge function `supabase/functions/terminal-assistant` (no RAG retrieval — unlike `chat`, it doesn't need syllabus/material grounding; keeps latency and cost low).
- Input: `messages[]`, `courseId`, `sessionId?`, plus `codeContext: { language, code, output, concepts }`.
- Auth: Bearer token, resolve student identity, verify enrollment in `courseId` and that the course is coding-approved (mirror `useCodingAccess` check server-side).
- System prompt enforces Socratic tutoring: explain errors, ask guiding questions, reference the student's actual code line-by-line, but never output a working solution or corrected full code; politely decline anything that looks like a graded quiz/exam question.
- Streams via Lovable AI Gateway (Gemini flash-lite, consistent with existing chat engine).
- Persists user + assistant messages to `chat_sessions` / `chat_messages` under a new mode `"terminal"`, scoped to `course_id`. Session titled `Terminal help — <unit or date>`.
- Log gateway calls via the shared `ai-log` helper.

## Phase 2 — Schema: terminal chat mode
- Allow `mode = 'terminal'` on `chat_sessions` (mode is a text column — confirm no CHECK constraint blocks the new value; add/adjust constraint only if one exists).
- No new tables. RLS on `chat_sessions`/`chat_messages` already scopes rows to the owning student.

## Phase 3 — Frontend: assistant panel in `CodingTerminalWidget`
- New `TerminalAssistantPanel` component: message list (markdown rendering, assistant text on plain background, user bubble with high-contrast token pair), composer with autofocus, typing indicator while awaiting reply.
- `CodingTerminalWidget` gains an `assistantEnabled` prop. Layout becomes a right-side collapsible panel (desktop: editor+output left ~2/3, assistant right ~1/3; mobile: toggleable overlay/sheet so the editor stays usable). A "Coding assistant" toggle button in the terminal header opens/closes it.
- On send, the panel calls `terminal-assistant` with the current code/output/language and unit concepts snapshot.
- `AIChat.tsx`: pass `assistantEnabled` only when the terminal was opened freeform (no `terminalContext.exerciseTitle/exerciseStatement`); exercise-opened terminals get the plain two-pane layout unchanged.

## Phase 4 — History integration
- Terminal sessions (mode `terminal`) load in the `/student/chat` history sidebar grouped under a "Terminal help" label, filtered to the active course (existing courseId scoping already applies).
- Opening a past terminal session from history shows read-only transcript in the assistant panel; student can continue it (appends to the same session).

## Phase 5 — Verification
- Freeform terminal: panel visible, hint-style answers, code/output context reflected in replies, conversation persists after reload.
- Exercise terminal and all assessment views: no panel, no assistant.
- History sidebar shows terminal sessions for the current course only.
- Typecheck + targeted tests.

## Risks / constraints
- **Academic integrity**: the "not for quiz questions" boundary is enforced three ways — panel absent from exercise/assessment surfaces, server-side coding-access + enrollment check, and a system-prompt refusal for graded-question patterns. Prompt-based refusal is best-effort, not a hard guarantee.
- **Context size**: code is sent verbatim each message; cap code/output sent (e.g. last ~8k chars) to control token cost.
- **Sidebar noise**: terminal sessions could flood chat history — mitigated by separate "Terminal help" grouping.
- **Judge0 is still placeholder**: output shown to the assistant is the current placeholder text until real execution lands; the assistant design is unaffected.
