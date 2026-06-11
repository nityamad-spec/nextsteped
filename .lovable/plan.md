# Fix horizontal scroll on `/student/chat`

When the page is zoomed (or viewed at a narrow width), the chat creates a horizontal scrollbar. Root causes are in `src/pages/student/AIChat.tsx`:

1. **Fixed-width sidebar (`w-72` = 288px)** sits side-by-side with the main chat area. As the effective viewport shrinks (zoom), 288px + main content overflows.
2. **Header row** holds the history button + Tabs (`Study` / `Exam Prep`) on the left and two buttons (`Practice Questions`, `New Chat`) on the right with no wrap, no `min-w-0`, no shrinking — pushes width past the viewport.
3. **Flex children missing `min-w-0`** on the main chat column → long content (code blocks, URLs, ExamPrepPanel inputs) prevents the column from shrinking.
4. **ExamPrepPanel** and message bubbles can contain unbreakable strings (code, long tokens) that force width.
5. Root container `flex h-[calc(100vh-57px)] md:h-screen` has no `overflow-x-hidden` / `w-full min-w-0` so overflow bubbles up to the page.

## Changes (all in `src/pages/student/AIChat.tsx`, plus tiny touch in `ExamPrepPanel.tsx`)

### 1. Root chat container
- Add `w-full min-w-0 overflow-x-hidden` to the top-level wrapper (both the active-assessment branch and the main return).

### 2. Sidebar becomes responsive
- Below `md` (≤768px), render the sidebar as an overlay (absolute-positioned drawer with backdrop) instead of taking layout width. At `md+`, keep the current inline `w-72` sidebar.
- Keep the existing toggle button; just change layout classes so the sidebar no longer competes for width on small/zoomed viewports.

### 3. Main column shrink-safe
- Add `min-w-0` to the `Main Chat Area` wrapper (`flex flex-1 flex-col` → `flex flex-1 flex-col min-w-0`).
- Add `min-w-0` to the messages container and ensure `break-words` on message bubbles (`max-w-[85%] … break-words overflow-wrap-anywhere`). Add `overflow-x-auto` only to `<pre>`/code inside prose via a small class so code scrolls inside the bubble, not the page.

### 4. Header responsiveness
- Wrap the header row: `flex flex-wrap items-center justify-between gap-2`.
- Allow the Tabs group to shrink: `min-w-0` on its container; on very narrow widths drop the tab text labels to icon-only (`hidden sm:inline` on "Study" / "Exam Prep" text).
- Right-side actions: allow wrap, shorten labels on `<sm` (icon-only buttons with `sr-only` text), and add `flex-wrap`.

### 5. ExamPrepPanel containment
- Ensure the panel itself uses `w-full min-w-0` and inputs/selects don't push beyond their container. The single `max-w-[140px]` input is fine; just confirm the surrounding flex rows use `flex-wrap gap-2` (already partially the case — add where missing).

### 6. Suggested-prompts grid
- Already `grid gap-2 sm:grid-cols-2`. Add `min-w-0` to the wrapper and `break-words` to the prompt text to prevent overflow on zoom.

## Out of scope
- No business-logic changes, no message-handling changes, no backend changes.
- No restyling beyond what's needed to remove horizontal overflow.

## Verification
- Open `/student/chat` and zoom to 150% / 200%; confirm no horizontal scrollbar and content reflows.
- Resize browser to ~360px width; sidebar opens as overlay, header wraps, no horizontal scroll.
- Long code message inside an assistant bubble scrolls inside the bubble, not the page.
