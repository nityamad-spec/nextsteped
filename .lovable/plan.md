# Prepare section: simplify Your STAR Stories box

Scope: `src/components/student/employment/StarStoryBuilder.tsx` only.

## Changes

1. **Header count**: remove "· N/16 themes" — the box header keeps only "3/12 stories".
2. **New section inside the box**, below the story list: label "Themes most-tested for freshers" with the 6 most-tested theme chips (Customer obsession, Ownership, Dive deep, Bias for action, Deliver results, Learn and be curious). All 6 chips always show the filled indigo style (no coverage-based highlighting).
3. **Remove the "Themes to cover" box** at the bottom. "Common prompts" expands to full width (grid becomes a single card).
4. Remove now-unused `coveredThemes` usage in this component (keep the export in `src/lib/starStories.ts` if still referenced elsewhere; otherwise leave the lib file untouched).

## Verification

- Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`).
- Authenticated Playwright screenshot of `/student/career-readiness` Prepare step confirming: header reads "3/12 stories", story rows intact and clickable, most-tested chips all filled, Common prompts full width, no Themes-to-cover box.
