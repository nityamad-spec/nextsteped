# Prefill the Study Chat from "Review with TA"

When a student clicks a "Review with TA" card on /student/home, the Study Chat composer opens pre-filled with an editable prompt about that concept. Nothing is sent automatically — the student can edit and press send.

## Behavior

- Weakest-concept card (mastery based): composer shows
  `I'm struggling with "<concept>". Explain it from the basics with a simple example, then check my understanding with a question.`
- Unexplored current-week card: composer shows
  `Help me get started with "<concept>" from this unit. Explain it in simple terms with an example.`
- Generic "Open the Study Chat" card: no prefill, unchanged behavior.
- Prompt appears only in Study mode, in the fresh chat that the card creates.

## Technical notes

- `StudentHome.tsx` already navigates to `/student/chat?newchat=true&concept=<name>`. Add a `&intent=weak` or `&intent=start` flag so the chat page knows which wording to use.
- `AIChat.tsx` currently ignores the `concept` param. In the existing `?newchat=true` effect, after creating the session, read `concept` + `intent` and call `setInput(...)` with the matching template. Guard on learning mode only.
- Clear the params from the URL after applying (replace-state) so a later manual "New chat" doesn't re-prefill.

## Out of scope

- No changes to chat backend, grounding, or message persistence.
