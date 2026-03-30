

## Plan: Render Markdown in Chat Messages

### Problem
Line 381 in `AIChat.tsx` renders message content as plain text (`{msg.content}`), so markdown formatting (headers, bold, lists, code blocks) from the AI appears as raw syntax.

### Approach
Use `react-markdown` with `remark-gfm` for GitHub-flavored markdown support, and style code blocks with proper formatting. The project already uses Tailwind's `prose` classes via `@tailwindcss/typography` (or we add them).

### Changes

**1. Install dependencies**
- `react-markdown` — renders markdown to React components
- `remark-gfm` — tables, strikethrough, task lists
- `rehype-highlight` or inline styling for code blocks (optional, can use Tailwind prose)

**2. `src/pages/student/AIChat.tsx`**
- Import `ReactMarkdown` and `remarkGfm`
- Replace the plain text render in `renderMessage` (line 381):
  ```tsx
  // Before
  <div className="whitespace-pre-wrap">{msg.content}</div>

  // After
  <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
  </div>
  ```
- Apply the same rendering to the `streamingMessage` display (around line 500+)

**3. `tailwind.config.ts`** (if needed)
- Add `@tailwindcss/typography` plugin for `prose` classes (check if already present)

### Files Modified
- `package.json` — add `react-markdown`, `remark-gfm`
- `src/pages/student/AIChat.tsx` — use ReactMarkdown in message rendering
- `tailwind.config.ts` — add typography plugin if missing

