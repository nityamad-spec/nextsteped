# Add starter prompts to the Student Teaching Assistant chat

Show a small grid of clickable example prompts on `/student/chat` (Study mode only) when a chat is empty — only the welcome message present — so students have a starting point. Mirror the pattern already used on `/teacher/chat`.

## Change

`src/pages/student/AIChat.tsx` only.

1. Add a module-level constant `STUDENT_SUGGESTED_PROMPTS` with 6 prompts, each `{ icon, label, prompt }`. Icons from `lucide-react`:
  - **Explain a concept** (`Lightbulb`) — "Explain this week's key concept in simple terms with an example."
  - **Walk through an example** (`BookOpen`) — "Walk me through a worked example for [topic] step by step."
  - **Quiz me** (`ListChecks`) — "Quiz me with 5 practice questions on this week's material and check my answers."
  - **Compare two ideas** (`GitCompare`) — "What's the difference between [X] and [Y], and when do I use each?"
  - **Prep for the exam** (`GraduationCap`) — "What topics should I focus on for the upcoming exam, and how should I study them?"
2. Refactor `sendMessage` minimally to accept an optional `overrideContent?: string` so the click path doesn't wait for input state to update. Replace `input` reads with `(overrideContent ?? input)`. Default behavior unchanged; existing call sites (`onKeyDown`, send button) stay the same.
3. In the messages container (around lines 1077–1097), after `activeChat.messages.map(renderMessage)` and the streaming placeholder, render the suggestions block only when:
  - `mode === "learning"` (hide in Exam mode — input is disabled there)
  - `!assessmentActive`
  - `!isStreaming`
  - `activeChat.messages.length <= 1` (just the welcome message)
   Layout: small heading "Try one of these to get started", then a 1-col / `sm:grid-cols-2` grid of `Button variant="outline"` tiles. Each tile shows the icon + bold label + a truncated (2-line) prompt preview, and on click calls `sendMessage(s.prompt)`.
4. Styling uses existing semantic tokens (`border`, `bg-card`, `text-muted-foreground`, `text-primary`) and matches the rounded-2xl card aesthetic used elsewhere on the page.

## Out of scope

- No edge-function, system-prompt, relevance-classifier, or RAG changes — these are static client-side seed prompts.
- No persistence of suggestions.
- No changes to Exam mode, practice widget, or `/teacher/chat`.
- No new business logic (mastery, scoring, etc.).