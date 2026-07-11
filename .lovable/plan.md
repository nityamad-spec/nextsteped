# Coding Terminal on /student/chat — UI/placeholder

## Goal

Add a new "Code" button next to the existing "Practice Questions" button on `/student/chat` (learning mode). Clicking it opens a full-screen coding terminal widget — same surface pattern as `PracticeQuestionsWidget`. This first pass is UI only: layout, controls, empty output state, and mocked Run behavior. Judge0 wiring comes in a follow-up.

## Scope of this plan (what we build now)

1. **New component `src/components/CodingTerminalWidget.tsx**`
  - Full-screen widget mirroring `PracticeQuestionsWidget` structure (header with title + close button, body fills viewport).
  - **Header row**
    - Title: "Code Terminal"
    - Language selector (`Select`) — populated from the approved-languages list (see §Language control below).
    - "Run" button (primary) — disabled while `isRunning`; shows a spinner + "Running…" during the mocked call.
    - "Reset" button — restores the starter snippet for the selected language.
    - Close (X) button.
  - **Body — stacked layout**
    - Top pane (~60%): code editor area. For the placeholder use a styled `<textarea>` (monospace font, `whitespace-pre`, tab handling to insert 2 spaces, line-count-friendly styling). No Monaco/CodeMirror dependency yet — keeps this pass purely presentational.
    - Bottom pane (~40%): "Output" console. Dark surface (using existing muted/card tokens, not hardcoded colors), monospace, scrollable. Empty state: "Run your code to see output here." After a mocked Run, shows a placeholder line like `[placeholder] Judge0 integration coming soon — your code was not executed.` plus an echo of the language + line count so students see the wiring is live.
  - **State (local only)**
    - `language`, `code`, `output`, `isRunning`.
    - Starter snippet per language (small map, e.g. Python `print("Hello, world!")`).
  - No persistence, no network calls, no `stdin` pane (per chosen "Editor + Output stacked" layout).
2. **Trigger button in `src/pages/student/AIChat.tsx**` (around lines 1271–1279)
  - Add a new `Button` immediately after the Practice Questions button, before "New Chat":
    - Icon: `Terminal` from lucide-react + label "Code" (mobile: icon only, matching Practice's `hidden sm:inline`).
    - Same `variant="outline" size="sm" className="h-9 text-sm gap-2"` styling as neighbors.
    - `onClick={() => setShowTerminal(true)}`.
  - Add `const [showTerminal, setShowTerminal] = useState(false);` alongside the existing practice widget state (~line 186).
  - Early-return block for the widget alongside the existing `if (showPractice) { … }` (~line 1069):
    ```tsx
    if (showTerminal) {
      return <CodingTerminalWidget onClose={() => setShowTerminal(false)} approvedLanguages={approvedLanguages} />;
    }
    ```
3. **Language control (placeholder source)**
  - For this UI-only pass, define the approved-languages list as a **local constant** inside `CodingTerminalWidget` (Python, plus a couple of commented-out entries) so the dropdown renders with real data.
  - Add a short `// TODO(judge0):` comment noting that this list will later be sourced from a professor-controlled setting (likely `course_ta_settings` — to be decided when we build the professor UI).
  - No DB, no new table, no professor UI in this pass — you asked to design UI first and check before decisions, and the professor-side control is a separate design conversation.

## Out of scope (explicitly, until we discuss further)

- Judge0 API integration, submission polling, real stdout/stderr rendering, execution limits.
- Professor UI to manage approved languages, and any `course_ta_settings` / migration changes to store it.
- Real code editor library (Monaco, CodeMirror) — placeholder textarea only for now.
- Persisting code drafts across sessions, sharing runs into chat, or attaching output to messages.
- Stdin pane, custom test cases, file uploads.

## Technical notes

- Files touched:
  - **New:** `src/components/CodingTerminalWidget.tsx`
  - **Edited:** `src/pages/student/AIChat.tsx` (state + button + early return; ~10 lines added)
- Uses existing shadcn primitives: `Button`, `Select`, `ScrollArea` (or plain overflow), and lucide `Terminal`, `Play`, `RotateCcw`, `X`.
- Styling stays on semantic tokens (`bg-background`, `bg-muted`, `text-foreground`, `border`) — no hardcoded colors, consistent with project design-system rule.
- No changes to routing, auth, RLS, edge functions, or data fetching.

## Open questions before I build

1. **Starter snippet content** — OK to hardcode a "hello world" per language in the widget for now. 
2. **Approved-languages placeholder** —  seed Python + C++ + Java + JavaScript so the selector visibly demonstrates the "approved list" concept?
3. **Mocked Run behavior** — placeholder output say "Judge0 integration coming soon"

I'll wait on your answers to these three before implementing so we lock the placeholder feel you want.