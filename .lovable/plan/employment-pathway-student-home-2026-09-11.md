# Employment Pathway student home

Employment-pathway courses get their own student home layout. Academic courses are untouched.

## What the student sees (employment pathway)

Order on `/student/home`:

1. **What's new** — unchanged.
2. **What to do today** — unchanged, plus a "View full learning pathway" link to `/student/learning-path`.
3. **Your Employment Pathway header** — course target role (e.g. "AI Engineer Track · toward job-ready") with an overall progress figure and a short encouragement line, styled like the screenshot's indigo panel.
4. **Daily DSA** — card beside the pathway panel: day counter, streak, a sample problem title with difficulty/topic chips, and a "Start today's problem" button. Visual only for now; the button is disabled with a "Coming soon" note.
5. **Openings matched to you** — three example company cards (logo initial, company, tier/location, role, salary band, match bar with Ready / Stretch / Early label). Static demo content, clearly example data, with a "View all" link that is inert for now.
6. **Concept mastery** and **Achievements** — kept below, unchanged.

Academic courses keep exactly the current home page.

## Professor side

The target role is set by the professor. A "Target role" text field is added to the employment-only **Soft Skills** setup step (e.g. "AI Engineer"), saved on the course and shown on the student home header. If it is empty, the student header falls back to the course name.

## Technical notes

- Migration: `courses.target_role text` (nullable). No other schema changes; openings and DSA are front-end demo data.
- `useCourseType` already resolves academic vs employment per course; `StudentHome.tsx` waits for `ready` before branching so the academic layout never flashes.
- New components under `src/components/student/employment/`: `EmploymentPathwayHeader.tsx`, `DailyDsaCard.tsx`, `MatchedOpeningsSection.tsx`, plus a `demoOpenings.ts` fixture.
- `StudentHome.tsx` renders the three new blocks between "What to do today" and the mastery section when `isEmployment` is true; all existing data loading, quiz gating and mastery logic stay as-is.
- Overall progress in the header reuses the existing course mastery value already loaded on the page.
- `SoftSkillsSetup.tsx` gains the target-role field with save-on-blur, using the existing course update path.
- Section titles use the standardized `text-xl font-heading font-semibold` style; all colors come from existing design tokens.
