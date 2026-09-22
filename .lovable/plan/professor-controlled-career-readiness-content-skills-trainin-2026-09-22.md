# Professor-controlled Career Readiness content (skills training pathway)

Today the student Career Readiness page pulls most of its content from hardcoded sample data. This plan moves that content under the professor's Soft Skills tab in course setup, with an AI draft the  
professor can edit before publishing.

## What the professor gets

The Soft Skills setup page gains three new sections below the existing Target role / Modules cards,
one per student step:

**Understand**

- Interview rounds: title, description, weight (%) — add, edit, reorder, delete.
- "What they're really testing": question + guidance pairs.
- Most-tested skills: short tag list.
- Company-specific notes stay exactly as they are today (unchanged sample content).

**Prepare**

- Common prompts: question + guidance pairs shown in the STAR story builder.

**Practice (Mock Interview Lab)**

- Mock types: title, minutes, description, accent/icon, and the target number of mocks students
should aim for per type.
- Per type, the session prompt: main question + follow-up.

**AI draft**

- One "Draft with AI" button per section (and a "Draft all") generates content from the course's
target role, course name, and concept list. Everything lands as editable fields — nothing is
shown to students until saved with the section's Published switch on.

## What students see

- Career Readiness Understand / Prepare / Practice render the professor's content instead of the
sample data.
- Mock lab tiles, per-type targets, and the total counter come from the professor's list; starting
a mock uses the professor's prompt with the existing session screens unchanged.
- Any section the professor hasn't set up shows a short notice ("Your professor hasn't set this up
yet") in place of that section.
- Company-specific notes keep showing today's sample companies.

## Technical notes

- New table `public.course_career_readiness` (one row per course): `course_id` unique FK,
`interview_rounds jsonb`, `tested_questions jsonb`, `tested_skills text[]`,
`common_prompts jsonb`, `mock_types jsonb`, plus `understand_published`, `prepare_published`,
`practice_published` booleans and timestamps. GRANTs for `authenticated` and `service_role`,
RLS: course teachers/admins manage; enrolled students select.
- New edge function `generate-career-readiness-content` (Lovable AI Gateway, structured JSON,
same pattern as `generate-daily-dsa-questions`) taking `{ course_id, section }` and returning the
draft arrays; the client saves after the professor reviews.
- New hook `useCourseCareerReadiness(courseId)` returning the row plus per-section published flags.
- `src/lib/careerReadinessBriefing.ts`, `src/lib/mockInterviews.ts` and `COMMON_PROMPTS` in
`src/lib/starStories.ts` become AI-draft seed defaults only; runtime rendering switches to the
hook. `COMPANY_SPECIFIC_NOTES` and `RECENT_MOCKS` stay static.
- `MockInterviewLab` builds its `MockConfig` objects from the stored mock types (checklist and
review notes keep today's defaults); `CodingMockSession`, `MockReadyScreen`, `MockReviewScreen`
are unchanged.
- Everything is gated to employment-pathway courses, matching the existing Soft Skills gating.

## Verification

- Typecheck plus existing `MockInterviewLab` / `CareerReadinessStepper` / `codingMock` tests.
- Browser check: draft + save each section on an employment course, then confirm the student page
shows the professor's content and shows the notice for an unset section.