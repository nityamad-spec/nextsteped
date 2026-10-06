# Jobs step for skilling courses

## What gets built

**1. New optional "Jobs" step in Course Setup (skilling courses only)**
- Appears as the last step with a small "New" tag, in the same card style as the others.
- It's optional, so it never blocks publishing. It shows as Complete after the first successful refresh.
- Header: title, a one-line description, "Last refreshed X ago · N jobs live for students", a **See student view** button, and a **Refresh jobs** button.

**2. Refresh jobs (professor only)**
- Searches every active source for entry-level jobs that match the course's target role, in India or remote and open to candidates in India.
- Skips senior, lead and manager titles and removes duplicates across sources.
- The app's default AI checks only listings it hasn't seen before. It confirms the role, that the job is entry level (0–2 years) and that the location fits. It then sets a tier (Accessible, Moderate or Competitive) and pulls out the required skills, each with a level (basic, working or advanced). Where a skill matches one of the course's own skill names, it uses that name.
- Jobs that have disappeared from the sources are removed. If a refresh fails, the previous jobs stay.
- 60-second cooldown between refreshes, a progress display while it runs, and a success or error message at the end. If no source is active, you get an error and the refresh doesn't run.

**3. Job sources tab**
- List of this course's sources showing name, link, type chip, a "Key saved" chip where relevant, an Active checkbox and a Remove button. Shows "X of Y sources active".
- Add form: link (https only), optional name (defaults to the site's domain), type (Job board API, RSS or JSON feed, Company careers page), and an optional API key in a password field.
- Inline errors for invalid, duplicate or unsafe links (localhost and private network addresses are blocked).
- Notes on the page that sources apply to this course only and must allow automated access.
- Remotive is added as a default source for each course.

**4. Curriculum coverage tab**
- **Pull curriculum** loads the modules (lesson-plan weeks) and concepts, with the skill and level each concept teaches. It shows a summary (modules, concepts, skills) and lets you expand each module.
- Concepts don't have skill tags today. When tags are missing, a **Suggest skill tags** action lets the AI fill them in, and you can edit each concept's skill and level from dropdowns.
- **Check coverage** stays disabled until the curriculum is pulled. Scoring:
  - Covered: taught at or above the level jobs require.
  - Half credit: taught, but at a lower level.
  - Missing: not taught.
- Results show:
  - the overall percentage and "N of M jobs fully covered"
  - coverage by job tier
  - a ranked list of skills to add or deepen, tagged "Not taught" or "Needs more depth", with how many jobs ask for each
  - covered skills shown as chips
  - an expandable breakdown for each job

**5. Student Jobs page**
- Added as a new section in Resources under Learning Path, for skilling courses only.
- Lists the live jobs with title, company, location or remote, package (when known), tier and an apply link. Students cannot refresh.
- "See student view" opens this page.
- "Target role examples matched to you" on the student home page will link here.

## Access and safety
- Only the course's professors can manage sources, edit skill tags or refresh. Enrolled students can only read the jobs.
- API keys stay on the server. They are never sent back to the browser and show only as "Key saved".

## Technical details
- Migration (with grants and RLS) adds:
  - `course_job_sources`: course_id, name, url, type, active, has_key. The key itself lives in a separate `course_job_source_secrets` table that only the server can read.
  - `course_jobs`: course_id, source_id, external_key (for dedup), title, company, location, is_remote, package, apply_url, tier, skills jsonb, first_seen_at, last_seen_at.
  - `course_job_refreshes`: status, counts, error, started_at and finished_at. This drives the cooldown and lets only one refresh run at a time.
  - `concept_skill_tags`: concept_id, skill, level.
- Edge function `refresh-course-jobs`:
  - checks that the caller is a course professor and enforces the cooldown and lock
  - blocks unsafe links (resolves the address and rejects private ranges)
  - fetches each source: Remotive API, generic RSS or JSON feed, or a careers page via Firecrawl
  - filters titles, deduplicates, and classifies new listings in small batches using `openai/gpt-6-astra` with structured output
  - updates the jobs table and prunes jobs that no longer appear in the sources
- Edge functions `manage-job-sources` (add/remove/toggle; stores keys on the server only) and `suggest-concept-skills` (AI skill-tag suggestions).
- Coverage is calculated in the browser from the jobs and skill tags.
- Remotive is added when a course is created as a skilling course, and backfilled for existing skilling courses.
- Files: CourseSetup card, a new `JobsSetup.tsx` page and route, a Jobs section in `StudentResources.tsx`, and a link from the home section.
