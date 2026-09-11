# Learning Path: Career Readiness stepper links to tab

On the employment pathway's `/student/learning-path`, Stage 3 (Career Readiness) currently renders the full stepper plus inline content (briefing, STAR builder, mock lab, modules). Change it so Stage 3 shows **only the three steps — Understand, Prepare, Practice** — and clicking a step navigates to the Career Readiness tab with that step opened.

## Changes

1. **Extract the stepper** — Move the Understand/Prepare/Practice stepper card out of `src/components/student/employment/CareerReadinessSteps.tsx` into its own component `CareerReadinessStepper.tsx` (props: `active`, `onSelect`). No visual changes to the stepper itself.
   - `CareerReadinessSteps.tsx` uses the new component, behavior unchanged.

2. **Learning path: steps only** — In `src/pages/student/StudentLearningPath.tsx` (both render sites, lines ~573 and ~614), replace `<CareerReadinessSteps …>` with the stepper alone (nothing pre-selected) where clicking a step navigates to `/student/career-readiness?step=<key>`. The inline briefing/builder/lab content no longer renders inside Stage 3.

3. **Deep link** — In `src/pages/student/CareerReadiness.tsx`, read the `step` query param (`understand` | `prepare` | `practice`) and pass it to `CareerReadinessSteps` as an `initialStep` prop; the steps component initializes its active step from it (falling back to current behavior when absent/invalid). Add a one-time `searchParams.delete("step")` replace so changing steps on the page afterward works normally.

4. **Verify** — Typecheck; browser-check `/student/learning-path` (Stage 3 shows steps only, click "Prepare" lands on the Career Readiness tab with Prepare open) and `/student/career-readiness` (loads default step, step switching still works).

## Technical notes
- No schema or data changes.
- `CAREER_READINESS_STEPS` in `src/lib/careerReadiness.ts` stays the single source of step keys.
- Academic pathway untouched.
