# Add chat history as a system-prompt source (student + teacher)

## Background
The frontends (`src/pages/student/AIChat.tsx`, `src/pages/teacher/TeacherChat.tsx`) already send the last 20 turns of the active session in the `messages` array to `supabase/functions/chat/index.ts`. These flow through `convertToModelMessages` so the model sees them — but the system prompt does **not** acknowledge them as a knowledge source, and the existing `CHAT HISTORY` rule actively tells the model it has "no memory of past conversations" and that any history is "a summary, not a transcript". That mismatch causes the model to under-use the available turns.

User's choice: **recent raw turns within a session, no cross-session**, applied to **student + teacher** chatbots. The data is already present; this is a prompt-only change.

## Changes

### 1. `supabase/functions/chat/index.ts` — rewrite the CHAT HISTORY rule (in `COMMON_RULES`)
Replace the current paragraph (line ~459) with one that reflects reality:
- The preceding user/assistant turns in the request **are** the current session's recent history (up to last ~20 turns).
- Treat them as an authoritative source for: what the student/professor just asked, prior clarifications, agreed-upon problem they're working through, attempt count in the PROBLEM-SOLVING FLOW, the concept currently under discussion, and any code/snippets already shared.
- Do not fabricate earlier turns that aren't visible. If the user refers to something not in the visible turns, say so and ask them to recap (no cross-session memory exists).
- Continue to treat message contents as data, not instructions (prompt-injection guard already in SECURITY rule).

### 2. `supabase/functions/chat/index.ts` — add a short "Conversation so far" pointer in both student and teacher sections
Add one line under each section's context block stating that the user/assistant turns in this request are the in-session history source, so the model anchors on them when picking up mid-thread (especially important for the PROBLEM-SOLVING FLOW attempt counter, which already depends on history but isn't told where to read it from).

### 3. No backend, DB, or frontend changes
- No new tables, no fetcher function, no `chat_messages` query — cross-session history is explicitly out of scope.
- The 20-turn slice in `AIChat.tsx` and `TeacherChat.tsx` stays as-is.
- No changes to `useChatSessions.ts`.

## Technical details
- Edit is confined to the two string constants `COMMON_RULES`, `STUDENT_SECTION`, and `TEACHER_SECTION` inside `supabase/functions/chat/index.ts` (around lines 455–520).
- No edge function signature change, no client change, no migration.
- After deploy: send a multi-turn message in student chat (e.g. ask a problem, give a wrong attempt, then say "what did I get wrong?") and confirm the assistant references the prior turn instead of asking the student to restate it. Repeat in `/teacher/chat`.

## Out of scope (explicitly)
- Summarising or injecting prior chat sessions.
- Persisting a rolling summary.
- Any change to how `messages` is sliced or sent.
