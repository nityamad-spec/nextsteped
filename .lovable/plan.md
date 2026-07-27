## Plan: Widen welcome message and suggested prompts in Study mode

### Goal
In `/student/chat` Study mode, make the welcome-message bubble and the suggested-prompt cards wider so they use more of the available page width.

### Current state
- `AIChat.tsx` line 1142: first assistant welcome bubble is capped at `max-w-[65%] md:max-w-[55%]`.
- `AIChat.tsx` line 1444: the "Try one of these to get started" prompt grid is capped at the same `max-w-[65%] md:max-w-[55%]`.
- Both sit next to the "New Chat" button (Study mode only), which must remain usable.

### Proposed changes
1. **Welcome message bubble**
   - Increase width cap from `max-w-[65%] md:max-w-[55%]` to `max-w-[85%] md:max-w-[80%]`.
   - Keep the right-side "New Chat" button from wrapping by ensuring the flex container still has `justify-between` and `gap-2`.
   - Verify on small screens that the button either stays inline or wraps cleanly without overlapping text.

2. **Suggested prompts grid**
   - Increase container width cap from `max-w-[65%] md:max-w-[55%]` to `max-w-[85%] md:max-w-[80%]`.
   - Keep the 2-column grid layout (`sm:grid-cols-2`) and existing card styling.
   - Ensure the prompt text still line-clamps at 2 lines so cards do not grow excessively tall.

3. **Responsive safety check**
   - Inspect the same elements on mobile viewport to confirm no horizontal overflow or clipped text.
   - Confirm the change only affects Study mode (`mode === "learning"` paths) and leaves Exam Prep mode untouched.

### Files to modify
- `src/pages/student/AIChat.tsx` (two Tailwind width classes)

### Risks / constraints
- The "New Chat" button may wrap on very narrow viewports if the welcome bubble becomes too wide; we will keep a flex gap and allow the button to shrink or wrap gracefully.
- Making the bubble 80–85% of the message column still leaves clear visual separation from the user avatar on the right, so it should not be mistaken for a user message.

### Verification
- Visual check in the preview at desktop and mobile widths.
- Confirm the selected element text no longer appears squeezed into 55% of the column.