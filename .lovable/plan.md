# Render math formulas in student chat

Currently the student AI chat renders messages with `ReactMarkdown` + `remarkGfm` only, so LaTeX like `$$ P(A|B) = \frac{P(B|A)\,P(A)}{P(B)} $$` shows as raw text. We'll add proper math rendering so inline (`$...$`) and block (`$$...$$`) formulas display as typeset equations.

## Changes

1. **Add dependencies**
   - `remark-math` — parses `$...$` and `$$...$$` in markdown
   - `rehype-katex` — renders parsed math to HTML via KaTeX
   - `katex` — provides the CSS stylesheet

2. **`src/pages/student/AIChat.tsx`**
   - Import `remarkMath`, `rehypeKatex`, and `katex/dist/katex.min.css`
   - Pass `remarkPlugins={[remarkGfm, remarkMath]}` and `rehypePlugins={[rehypeKatex]}` to both `ReactMarkdown` instances (lines 944 and 953)

3. **Scope**
   - Only the student chat, as requested. Teacher chat, practice questions, and quiz dialogs are left unchanged. (Happy to extend to those surfaces in a follow-up if you want consistent math rendering everywhere.)

## Notes / risks

- KaTeX CSS is ~25KB gzipped; imported once globally from the chat page.
- The AI's existing output already uses `$$...$$` / `$...$`, so no edge-function prompt changes are needed. If a formula was written without delimiters (e.g. plain `P(A|B) = ...`), it will still render as text — that's a model-output issue, not a rendering one.
- KaTeX is strict about syntax; malformed LaTeX renders a red error inline rather than crashing. Acceptable default.

## Open question

Do you want the same math rendering applied to the **teacher Course Assistant chat** and **weekly quiz / practice question explanations** too, or keep this strictly to `/student/chat` for now?
