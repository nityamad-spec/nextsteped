# Understand step: role interview briefing (employment pathway)

Rebuild the **Understand** step of Career Readiness as a static role briefing, matching the attached screenshot. Professor-assigned modules are removed from Understand only; **Prepare** and **Practice** keep their existing module lists.

## What the student sees

When the Understand step is active (under `/student/career-readiness` and in Stage 3 of `/student/learning-path`):

1. **Section heading** — "Step 1 · Understand — what a {target role} interview looks like".
2. **Role overview + "The rounds you'll face" card** — intro line naming the role, then a numbered list of interview rounds, each with a short description and a weight badge (e.g. Coding 30%, LLM & ML depth 45%).
3. **"What they're really testing" card** — a 2×2 grid of common interview questions with guidance on what a strong answer looks like, plus a row of skill chips ("Most-tested for freshers").
4. **"Company-specific notes" card** — notes tied to the same static demo companies used in the home page "Openings matched to you" section.
5. **Completion banner** — "You've reviewed what's coming" with a "Go to Prepare →" button that switches the stepper to Prepare.

All copy is static demo content in code; the course's `target_role` name is interpolated into headings/intro. No database or setup changes.

## Technical details

- New file `src/lib/careerReadinessBriefing.ts`: static briefing data (role overview, rounds with weights, tested questions, skill chips, company notes reusing the demo companies from `MatchedOpeningsSection`), with the target role passed in for interpolation.
- New component `src/components/student/employment/UnderstandBriefing.tsx`: renders the cards above with semantic tokens; accepts `targetRole`, `onGoToPrepare`.
- `CareerReadinessSteps.tsx`: when the active step is `understand`, render `UnderstandBriefing` instead of the module list; Prepare/Practice unchanged (still list professor-assigned modules). Thread `targetRole` through from `CareerReadiness.tsx` and `StudentLearningPath.tsx`.
- Empty-state behavior for Prepare/Practice unchanged.
- Verify: typecheck, then browser-check the career readiness page and learning path Stage 3.
