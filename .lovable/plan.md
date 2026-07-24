## Goal
On `/student/chat`, relocate the **New Chat** button so it appears only in Study mode, inline to the right of the first assistant welcome message, and reduce the width of that welcome message bubble.

## Verified current state
- `src/pages/student/AIChat.tsx` renders the header action bar at lines 1396–1405. Inside `{mode === "learning" && ...}` it shows **Code** and **New Chat** buttons.
- The first assistant message uses `getWelcomeLearning(courseName)` (line 50) and is rendered by `renderMessage` (lines 1085–1187) with `max-w-[85%]`.
- Exam Prep has its own welcome (`WELCOME_EXAM`, line 51) and does not show the Study header actions.

## Changes

### 1. Narrow the first welcome bubble (Study mode only)
- In `renderMessage`, when the message is the **first assistant message** and `mode === "learning"`, apply a tighter max-width (e.g. `max-w-[65%] md:max-w-[55%]`) instead of the default `max-w-[85%]`.
- Keep padding, font size, and citation/footnote behavior unchanged.
- Use a stable check: `msg.id === activeChat.messages[0]?.id && msg.role === "assistant" && mode === "learning"`.

### 2. Move New Chat button inline with the welcome message
- Remove the **New Chat** button from the header action bar (lines 1401–1403), leaving only the **Code** button in Study mode.
- After the first assistant welcome message in Study mode, render a compact **New Chat** button to the right of the bubble.
- Implementation options (pick one):
  - **Option A — inside renderMessage:** add the button as a sibling of the bubble when the message is the first assistant message and `mode === "learning"`.
  - **Option B — outside renderMessage:** in the messages list (around line 1449), wrap the first message + button in a flex row.
- Recommended: **Option A** keeps the change localized to `renderMessage` and naturally follows the existing message layout.
- Button style: small icon/text button (`size="sm"`, `variant="outline"` or `ghost`) with `Plus` icon and "New" or "New Chat" label. On small screens show icon-only to avoid wrapping.

### 3. Preserve existing behavior
- Keep **Code** button in the Study header.
- Keep the sidebar "New Chat" button (line 1271) and the empty-state "New Chat" button (line 1504) unchanged.
- Exam Prep mode remains unaffected: no New Chat button in header or welcome area.

## Technical notes
- The first-message detection must be robust against streaming messages and the `streamingMessage` placeholder. Only target committed messages (`activeChat.messages[0]`), not `streamingMessage`.
- The inline button should not interfere with message hover/focus or citation footnotes.
- No backend, route, or state-management changes are required.

## Risks
- **Visual wrapping on small screens:** a long course name + a "New Chat" label may wrap. Mitigate with icon-only on mobile and `shrink-0` on the button.
- **First-message ambiguity:** if a user refreshes and the first message is not the welcome (e.g. an existing long chat), the narrower bubble logic should not apply to later assistant messages. The `msg.id === activeChat.messages[0]?.id` guard prevents this.
- **Accessibility:** moving the button out of the header changes its tab order and discoverability. Keep a visible label and ensure keyboard focus is obvious.

## Out of scope
- No changes to Exam Prep mode.
- No changes to the Practice Questions widget, Code terminal, or assessment flow.
- No changes to the sidebar or empty-state New Chat buttons.
