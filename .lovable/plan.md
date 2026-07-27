## Goal

On `/student/chat` in Study mode, remove the suggested prompt tiles:

- **Walk through an example**
- **Explore this week's news**

## Current state

In `src/pages/student/AIChat.tsx`:

- `STUDENT_SUGGESTED_PROMPTS` array (lines 56–63) contains six tiles, including the two to remove.
- `Lightbulb` and `Newspaper` icons are imported only for those two tiles.
- `PromptMode` type is `"news" | "materials"`; `"news"` is only referenced by the removed tile.

## Proposed change

1. Remove the two entries from `STUDENT_SUGGESTED_PROMPTS`:
  - `{ icon: Lightbulb, label: "Walk through an example", ... }`
  - `{ icon: Newspaper, label: "Explore this week's news", ... }`
2. Remove unused `Lightbulb` and `Newspaper` imports from the `lucide-react` import line.
3. Remove `"news"` from the `PromptMode` union type, leaving only `"materials"`.
4. Verify the remaining four tiles still render correctly in Study mode.

## Risks / constraints

- The `"news"` promptMode branch in the chat backend/edge function may still exist, but no UI entry will trigger it. No backend changes are required unless you also want to drop news-mode support entirely.
- No database or API changes are needed.

## Open questions

- Only the UI tiles.
- Remaining four tiles be reordered