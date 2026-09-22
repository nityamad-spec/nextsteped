# Save STAR stories to the student's account

Stories in the Career Readiness "Prepare" step currently live only in the page and vanish on refresh. This makes them permanent, per student and per course.

## What changes for the student

- Writing a story saves it to their account. It's there after refresh, on any device.
- Editing a story updates the saved copy; "Improve my story" still rewrites the draft, and the rewrite is kept only when they press Save.
- The edit window gets a Delete button with a confirm step.
- The 3 sample stories are removed. A new student sees an empty list with a prompt to write their first story.
- Stories are separate per course: each employment course has its own set.
- The counter ("7 of 12 stories") and the progress slots now reflect what's actually saved.
- The Prepare step counts as complete at 6 saved stories; the "Ready to practice?" card shows that state instead of a fixed line.

## Technical notes

- New table `public.star_stories`: `id`, `student_id`, `course_id`, `title`, `themes text[]`, `situation`, `task`, `action`, `result`, `created_at`, `updated_at`. Grants for `authenticated` + `service_role`, RLS enabled, all policies scoped to `auth.uid() = student_id`. `updated_at` trigger reuses `update_updated_at_column()`.
- New hook `src/hooks/useStarStories.ts` — loads the current student's stories for a course and exposes `create`, `update`, `remove` with optimistic local state and toast on failure.
- `StarStoryBuilder.tsx` — drops the `stories`/`onStoriesChange` props, uses the hook, derives `writtenLabel` from `updated_at` (relative time) instead of a stored string, adds the delete + confirm flow, and removes the "not saved to your account yet" note.
- `CareerReadinessSteps.tsx` — removes the `DEMO_STAR_STORIES` state and passes `courseId` through; `CareerReadiness.tsx` already resolves the enrolled course id.
- `src/lib/starStories.ts` — removes `DEMO_STAR_STORIES`, `isStudentCreatedStory`, and `writtenLabel` from the type; keeps themes, most-tested themes, and common prompts. `starStories.test.ts` is replaced with coverage for the completion threshold and relative-time label.
- No change to the `improve-star-story` edge function.

## Verification

- Typecheck plus the Vitest suite.
- Authenticated Playwright run on `/student/career-readiness?step=prepare`: create a story, refresh and confirm it persists, edit it, delete it, and confirm the counter tracks each change.
