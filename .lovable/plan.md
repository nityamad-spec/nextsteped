# Concept Mastery Map — Brand Color Recolor

Scope: UI-only edit to `src/pages/teacher/CourseDashboard.tsx` (and a few tokens in `src/index.css` + `tailwind.config.ts`). No data, routing, or component-structure changes.

## Assumption on logo colors
You didn't specify the logo hex values, so I'll use the existing NextStep brand color already defined as `--primary: hsl(234 62% 52%)` (the indigo used across the app) as the base, and derive a 4-step intensity ramp by varying lightness. If you have specific logo hex codes (e.g. a 2-3 color logo with secondary accents), share them and I'll swap the ramp before implementing.

Proposed ramp (high → low intensity), darkest = Expert:

```text
Expert      234 62% 28%   (deepest)
Proficient  234 62% 42%
Developing  234 62% 60%
Beginner    234 55% 80%   (lightest)
```

## Changes

1. **Tokens** (`src/index.css`, light + dark blocks):
   - Override the four mastery tokens with the ramp above:
     - `--mastery-expert: 234 62% 28%`
     - `--mastery-proficient: 234 62% 42%`
     - `--mastery-progressing: 234 62% 60%` (still labeled "Developing" in UI)
     - `--mastery-beginner: 234 55% 80%`
   - Keep token names unchanged so the rest of the app keeps working; only the hue/lightness changes.

2. **Concept Mastery Map** (`CourseDashboard.tsx`, the existing block):
   - Legend swatches: keep `bg-mastery-*` classes (now repainted by the new tokens).
   - Per-row stacked bar: keep `bg-mastery-*` order (Beginner → Developing → Proficient → Expert) so darker shades sit on the right.
   - Per-row counts: replace `text-mastery-beginner / progressing / proficient / expert` with `text-muted-foreground` (theme grey ≈ #6B7280). Keep `font-medium` and the label text ("12 Beginner", etc.).

3. **No other components touched.** Mastery tokens are also used by the student-side mastery heatmap; the recolor will cascade there as well. Flagging this in case you want the ramp scoped only to the dashboard — if so, I'll introduce new `--brand-ramp-1..4` tokens instead and use them only in this card.

## Open questions (non-blocking)
- Confirm intensity direction: **Expert = darkest, Beginner = lightest** (my default). Flip if you want the opposite.
- Confirm cascading to the student mastery heatmap is OK, or I should scope this to just the dashboard card.
