# Career Readiness (employment pathway)

Rename Stage 3 to "Career Readiness", give it its own left-nav tab, and organise its modules into three steps: Understand, Prepare, Practice.

## What changes for students

- On the Learning Path, Stage 3 is now titled "Career Readiness" (still in the list, still expandable).
- Its body shows a three-step bar matching the reference: 1 Understand — "Know what's coming", 2 Prepare — "Build your stories", 3 Practice — "Rehearse & improve". The active step is highlighted; clicking a step shows the modules the professor assigned to it.
- A new left-nav tab "Career Readiness" appears whenever the course has published soft-skills modules. It opens a full page with the same three-step layout and the module list, plus the Study action that already exists.
- Everything else on the Learning Path is unchanged; academic-pathway courses are untouched.

## What changes for professors

- In Soft Skills setup, each module gets a Step selector (Understand / Prepare / Practice). Modules without a step default to Understand.

## Technical notes

- Migration: add nullable `step text` to `public.course_soft_skills` (values `understand` | `prepare` | `practice`). No drops. Regenerate types.
- `src/lib/pathwayStages.ts`: stage 3 title → "Stage 3 · Career Readiness", badge → "Career Readiness"; description updated. Existing tests updated for the new strings.
- New `src/components/student/employment/CareerReadinessSteps.tsx`: the three-step stepper + per-step module list, reusing the module rendering from `SoftSkillsUnitCard`. Active step = first step with unfinished/most relevant content, selectable by click.
- New page `src/pages/student/CareerReadiness.tsx` + route `/student/career-readiness` in `App.tsx`; loads published `course_soft_skills` for the active course and renders `CareerReadinessSteps`.
- `src/layouts/StudentLayout.tsx`: add the nav item, filtered like Project Lab — shown only when published soft-skills modules exist (new small hook `useCourseSoftSkills`, mirroring `useCourseProjectLabs`). Desktop and mobile nav both covered.
- `StudentLearningPath.tsx`: stage 3 body renders `CareerReadinessSteps` instead of `SoftSkillsUnitCard`; the `goToStudy` handler is reused unchanged.
- `SoftSkillsSetup.tsx`: add the Step select per module and persist it.

## Verification

- Typecheck, `pathwayStages` tests, and an authenticated browser pass on `/student/learning-path` and `/student/career-readiness` for the employment demo course.
