# Career Readiness: make step header text black

## Goal
Change the gray subtitle/header text under each Career Readiness step title from `text-muted-foreground` to black so it is more readable.

## Scope
Three locations, done in order:

1. **Understand** — `src/components/student/employment/UnderstandBriefing.tsx`
   - Line 45: the line that currently reads `STEP 1 · UNDERSTAND — WHAT AN AI ENGINEER INTERVIEW LOOKS LIKE`.

2. **Prepare** — `src/components/student/employment/StarStoryBuilder.tsx`
   - The equivalent step header line (around line 142).

3. **Practice** — `src/components/student/employment/MockInterviewLab.tsx`
   - The equivalent step header line (around line 24).

## Approach
- Replace `text-muted-foreground` with `text-black dark:text-white` on those specific step-header `<p>` elements only.
- Keep other muted helper text (descriptions, notes, timestamps) unchanged unless the user asks for it later.
- Preserve existing layout, spacing, and selected-state colors.

## Verification
- TypeScript check via `bunx tsgo --noEmit -p tsconfig.app.json`.
- Authenticated Playwright screenshot of `/student/career-readiness` and `/student/career-readiness?step=practice` to confirm the header text is now black.