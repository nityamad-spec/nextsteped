# Prepare section polish and Step 3 unlock

## What will change

### Prepare page text and color
- Remove the story count from the Step 2 heading so it reads `Step 2 · Prepare — STAR story builder`.
- Change the label under Your STAR Stories to exactly `Themes most-tested for freshers:`.
- Replace the current blue Common prompts background and inner borders with the selected periwinkle blue–violet treatment.

### Save STAR stories to the student account
- Replace temporary demo-only editing with student-specific, course-specific saved STAR stories.
- Add, edit, load, and retain stories across refreshes and future visits.
- Keep the existing story fields, theme selection, AI improvement, story list, and 12-story progress display.
- Demo examples will remain visual examples only and will not count toward unlocking Practice.

### Unlock Step 3 after five student-created stories
- Add a bottom action area below Common prompts explaining that five saved STAR stories are required.
- Show current progress toward five and a disabled Practice button until the requirement is met.
- Once five student-created stories are saved, enable the button and move the student to Step 3 Practice.
- Apply the same rule to every Step 3 entry point: the top step selector and direct `?step=practice` links cannot bypass the requirement.
- Keep Understand and Prepare freely accessible.

## Technical details
- Add a course-scoped student STAR stories table with authenticated-only grants and row-level rules so students can access only their own stories.
- Pass the active course into the career-readiness flow and centralize story loading, saving, and the five-story unlock state.
- Update the step selector to visibly disable Practice until eligible, with a concise explanation in the Prepare action area.
- Use semantic periwinkle design tokens rather than page-level hardcoded colors.

## Verification
- Test story persistence, create/edit behavior, and the five-story threshold.
- Test that the Practice button, step selector, and direct links remain blocked at four stories and unlock at five.
- Verify Prepare and Practice in authenticated desktop and mobile previews.
- Run the focused tests and TypeScript check; report unrelated existing failures without changing them.
