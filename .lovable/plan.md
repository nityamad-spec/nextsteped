## Plan: Narrower prompts + right-aligned New Chat on /student/chat

### What we’ll change

1. **Match prompt width to welcome message**
  - Wrap the suggested-prompts grid in a container capped at the same `max-w-[65%] md:max-w-[55%]` used for the welcome bubble.
  - Keep the 2-column grid layout inside that container so individual prompt cards are narrower and visually aligned with the welcome message width.
2. **Move New Chat to the far right**
  - Change the welcome-message row from `flex items-start gap-2 flex-1 min-w-0` to `flex items-start justify-between gap-2` so the New Chat button is pushed to the right edge of the chat area.
  - The welcome bubble keeps its current max-width; the button sits at the trailing edge with the existing gap.

### Files to edit

- `src/pages/student/AIChat.tsx` (welcome bubble + suggested prompts section)

### Verification

- TypeScript check (`bunx tsc --noEmit` or project lint command).
- Playwright screenshot of `/student/chat` in Study mode to confirm:
  - Welcome bubble and prompt grid share the same width.
  - New Chat button is flush right.
  - No overlap or truncation on mobile/smaller viewports.

### Risks / considerations

- **Responsiveness**: On very small screens the capped width may feel cramped; we can keep the existing padding and let the grid collapse to 1 column below `sm`.
- **No functional changes**: This only affects layout; chat history, streaming, fallback prompts, and practice-widget routing remain untouched.

### Questions

1.  prompt grid stay 2 columns inside the narrower containers.
2. On mobile (< `sm`), drop below it to avoid crowding