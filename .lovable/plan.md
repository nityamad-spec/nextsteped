# Render math formulas in student chat via LaTeX

## What's already in place
The student chat renderer (`src/pages/student/AIChat.tsx`) already loads KaTeX and passes assistant markdown through `remark-math` + `rehype-katex`, and `katex/dist/katex.min.css` is imported. So `$...$` inline and `$$...$$` display math will render correctly today — the only missing piece is that the AI isn't instructed to output LaTeX, so it writes math as plain text.

## Change
Update the STUDENT_SECTION system prompt in `supabase/functions/chat/index.ts` (student mode only; teacher/exam prompts untouched). Add one new bullet in the "STUDENT STYLE" section:

> **MATH FORMATTING**: Whenever the response contains a formula, equation, variable, symbol, fraction, exponent, subscript, summation, integral, matrix, or Greek letter, write it in LaTeX. Inline uses `$...$` (e.g. `$E = mc^2$`, `$x_i$`, `$\frac{a}{b}$`); display math uses `$$...$$` on its own line. Do NOT write math as plain text (`x^2`, `sqrt(x)`, `a/b`, `π`, `≤`, `∑`). Applies to every subject, not just math. Code in code blocks stays as code — only math notation uses LaTeX.

## Out of scope
- No client-side changes (rendering already works).
- No changes to teacher chat, exam mode prompt, or any other edge function.
- No new dependencies.

## Verification
After deploying the updated edge function, send a message like "explain the quadratic formula" in `/student/chat` and confirm the formula renders as typeset math rather than raw `$...$` text.
