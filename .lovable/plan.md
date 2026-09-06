# Plan: Switch terminal-help conversations inside the terminal

## Problem
On `/student/chat`, opening a coding-terminal conversation from History launches the terminal with that transcript loaded, but the assistant panel has no way to switch to a different conversation — the student must close the terminal and pick another one from the sidebar.

## What we'll build

### 1. Conversation dropdown in the assistant panel header
- The assistant panel (`TerminalAssistantPanel.tsx`) loads the student's saved terminal-help conversations for the current course itself (same query the sidebar uses: `chat_sessions` where `mode = 'terminal'`, newest first).
- The panel header shows the current conversation title as a dropdown button (chevron next to the title). Opening it lists all saved terminal-help conversations with their dates; the active one is highlighted.
- Picking one loads that conversation's messages into the panel (reusing the existing resume logic — set the session id, messages load from the database). The code in the editor is untouched.

### 2. "New conversation" action
- A "New conversation" item at the top of the same dropdown (with a plus icon). Choosing it clears the panel to the empty state ("Paste code… ask for a hint") and the next message starts a brand-new saved conversation. Editor content stays as-is.

### 3. Keep the list fresh
- After the assistant creates a new conversation (first reply), the dropdown list refreshes so the new title appears.
- The sidebar's "Terminal Help" group in `AIChat.tsx` keeps working as-is; both surfaces read the same saved conversations, so anything created in the terminal shows up in History too.

## Out of scope
- No changes to the regular teaching-assistant chat, the sidebar, or the database — this is UI-only.
- Exercise terminals (opened from a coding exercise) still have no assistant panel, unchanged.

## Technical notes
- Files touched: `src/components/coding/TerminalAssistantPanel.tsx` (dropdown, session list loading, new-conversation reset). No changes needed in `AIChat.tsx` or `CodingTerminalWidget.tsx` — the panel already receives `courseId` and manages its own `sessionId`.
- Uses existing shadcn dropdown-menu component; styling matches the panel's dark terminal theme.
- Verification: typecheck, then browser-drive the preview (sign-in permitting) or confirm the build plus a manual click-through path.
