# Prepare section polish and Step 3 unlock

## What will change

### Prepare page text and color
- Remove the story count from the Step 2 heading so it reads `Step 2 · Prepare — STAR story builder`.
- Change the label under Your STAR Stories to exactly `Themes most-tested for freshers:`.
- Replace the current blue Common prompts background and inner borders with the selected periwinkle blue–violet treatment.

### Keep STAR stories temporary for now
- Make no database or schema changes.
- Keep stories in the current page session; refreshing or leaving the page resets student-created stories and Practice access.
- Keep the existing story fields, theme selection, AI improvement, story list, and 12-story progress display.
- Demo examples remain visual examples only and do not count toward unlocking Practice.

### Unlock Step 3 after five student-created stories
- Add a bottom action area below Common prompts explaining that five saved STAR stories are required.
- Show current progress toward five and a disabled Practice button until the requirement is met.
- Once five student-created stories are saved, enable the button and move the student to Step 3 Practice.
- Apply the same in-session rule to every Step 3 entry point: the top step selector and direct `?step=practice` links cannot bypass the requirement.
- Keep Understand and Prepare freely accessible.

## Technical details
- Lift the temporary story state into the career-readiness flow so the Prepare page and step selector share the same five-story unlock status.
- Update the step selector to visibly disable Practice until eligible, with a concise explanation in the Prepare action area.
- Use semantic periwinkle design tokens rather than page-level hardcoded colors.

## Verification
- Test temporary create/edit behavior and the five-story threshold.
- Test that the Practice button, step selector, and direct links remain blocked at four stories and unlock at five.
- Confirm refresh resets student-created stories and locks Practice again.
- Verify Prepare and Practice in authenticated desktop and mobile previews.
- Run the focused tests and TypeScript check; report unrelated existing failures without changing them.
