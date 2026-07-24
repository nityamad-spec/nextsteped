## Goal

On `/student/chat`, make the "Quiz me" suggested prompt open the Practice Questions widget (same one currently launched by the header button), and remove the "Practice Questions" button from the chat header.

## Current state (verified in `src/pages/student/AIChat.tsx`)

- The chat header has two mode tabs (Study / Exam Prep). "Practice Questions" is not a tab — it's an outline button next to "Code" and "New Chat" in study mode (line 1397–1399) that calls `setShowPractice(true)`.
- "Quiz me" is one of the `STUDENT_SUGGESTED_PROMPTS` (line 57). Clicking it currently calls `sendMessage(s.prompt, s.promptMode)` (line 1479), sending a chat message to the TA.
- The Practice widget already renders as a full-screen replacement when `showPractice` is true (line 1189) and is also reachable from the sidebar history list (line 1284), so entry points survive after removing the header button.

## Changes (frontend-only, `src/pages/student/AIChat.tsx`)

1. **Special-case the "Quiz me" prompt in the suggested-prompt grid (~line 1472–1489).** In the `onClick` handler, if `s.label === "Quiz me"` (or a new `action: "practice"` flag on the prompt entry — see technical note), call `setShowPractice(true)` instead of `sendMessage(...)`. Also drop the `disabled={isStreaming || isCooldown}` gate for that entry so it stays clickable while a chat message is streaming.
2. **Remove the header "Practice Questions" button** (line 1397–1399). Leave the surrounding "Code" and "New Chat" buttons untouched.
3. **Keep everything else as-is**: the sidebar Practice Questions history entry, the `showPractice` state, the widget itself, and the `Dumbbell` import (still used in the sidebar history list at line 1290).

## Technical notes

- Cleanest approach: extend the `STUDENT_SUGGESTED_PROMPTS` entry type with an optional `action?: "practice"` field, tag the "Quiz me" entry with it, and branch in the click handler on `s.action === "practice"`. Avoids matching on the display label.
- No changes to `PracticeQuestionsWidget.tsx`, routes, or backend.

## Risks

- If a student had memorized clicking the header "Practice Questions" button, the only remaining always-visible entry point becomes the sidebar history (once they have prior sessions) and the "Quiz me" suggested prompt (only shown on an empty chat). If you want a persistent entry point kept in the header, tell me and I'll leave one Practice affordance in place.
- The "Quiz me" prompt currently seeds a graded chat exchange; switching it to open the Practice widget changes its behavior. Students who expected an inline TA quiz will now get the structured Practice flow instead.

## Out of scope

- No wording, icon, or ordering changes to other suggested prompts.
- No changes to Exam Prep mode, the widget UI, or scoring logic.

## Open question

Fully remove it and rely on the "Quiz me" suggested prompt + sidebar history as the only entry points?