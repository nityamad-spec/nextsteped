# Add suggested prompts to the Professor Course Assistant

Show a small grid of clickable example prompts on `/teacher/chat` when a chat is empty (only the welcome message present), so professors have a starting point.

## Change

`**src/pages/teacher/TeacherChat.tsx**` only.

1. Define a module-level constant `SUGGESTED_PROMPTS` with 3 prompts grouped lightly by icon/category:
  - **Suggest in-class exercises** — "Suggest 3 in-class exercises for this week's concepts that work for a 50-minute session."
  - **Brainstorm a case study** — "Brainstorm a real-world case study I can use to teach [concept]."
  - **Research an article** — "Find and summarize a recent article I can assign as pre-reading for [topic]."
   Each entry: `{ icon, label, prompt }` (icons from `lucide-react`: `Dumbbell`/`ListChecks`, `BookOpen`, `Search`, `ClipboardList`, `Lightbulb`, `MessageCircle`).
2. In the Messages `ScrollArea` (around lines 300–315), after `allMessages.map(...)`, render the suggestions card **only when `displayMessages.length <= 1**` (i.e. just the welcome message) AND `!isStreaming`. Layout: 2-column grid on `sm:`, single column on mobile, each tile a `Button variant="outline"` with icon + label that on click calls a new `handleSuggestionClick(prompt)`.
3. `handleSuggestionClick(prompt)` sets the input and immediately calls `sendMessage()`. Since `sendMessage` is a `useCallback` reading `input` from state, we'll refactor it minimally to accept an optional `overrideContent?: string` argument so the click path doesn't have to wait for a state update. Default behavior unchanged.
4. Styling: use existing semantic tokens (`border`, `bg-card`, `text-muted-foreground`, `text-primary`). No new colors. Match the existing rounded-2xl / card aesthetic in the page.

## Out of scope

- No edge-function or system-prompt changes — these are just chat seed messages.
- No persistence — suggestions are static client-side copy.
- No changes to the student AI chat.

