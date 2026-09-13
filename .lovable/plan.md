# Prepare section theme and Common prompts styling

Scope: `src/components/student/employment/StarStoryBuilder.tsx` only.

## Changes

1. **Show all themes per story row**
   - Render every theme chip for each story instead of `themes.slice(0, 2)`.
   - Let chips wrap to additional lines inside the row.
   - Remove the `+N` overflow badge because every theme is visible.

2. **Theme chip styling in story rows**
   - Background: white (`bg-white`).
   - Border and text keep the existing primary/indigo color.

3. **"Themes most-tested for freshers" label**
   - Change text to lowercase exactly: `"themes most-tested for freshers"`.
   - Use the same primary/indigo text color as the theme chips.

4. **Common prompts section hue**
   - Background: pale blue `#f0f9ff`.
   - Inner prompt card borders: `#bae6fd`.

## Verification

- Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`).
- Authenticated Playwright screenshot of `/student/career-readiness?step=prepare` confirming all themes wrap, label is lowercase and indigo, Common prompts has the pale blue background and borders.
