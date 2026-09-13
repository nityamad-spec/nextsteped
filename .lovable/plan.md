# Prepare section theme and Common prompts styling

Scope: `src/components/student/employment/StarStoryBuilder.tsx` only.

## Changes

1. **Show all themes per story row**
   - Render every theme chip for each story instead of `themes.slice(0, 2)`.
   - Let chips wrap to additional lines inside the row.
   - Remove the `+N` overflow badge because every theme is visible.

2. **"Themes most-tested for freshers" section**
   - Change label text to lowercase exactly: `"themes most-tested for freshers"`.
   - Label uses the same primary/indigo text color as the theme chips.
   - Theme chips in this section use a white background (`bg-white`) with the existing primary/indigo border and text.

4. **Common prompts section hue**
   - Background: pale blue `#f0f9ff`.
   - Inner prompt card borders: `#bae6fd`.

## Verification

- Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`).
- Authenticated Playwright screenshot of `/student/career-readiness?step=prepare` confirming all themes wrap, label is lowercase and indigo, Common prompts has the pale blue background and borders.
