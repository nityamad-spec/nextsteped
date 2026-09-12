# Prepare section: story renames + clickable story list

Scope: `src/components/student/employment/StarStoryBuilder.tsx` only. No data-model or persistence changes (stories still reset on refresh).

## Changes

1. **Rename button**: "New story" → "+ New STAR story" (keeps the Plus icon).
2. **Rename Coverage box** title to "Your STAR Stories". Keep the progress slots row and the "3/12 stories · N/16 themes" count text.
3. **Clickable story list inside the box**: under the slots, list each story as a row — title (truncated), theme chips (up to 2), and "written" label. Clicking a row opens a **read-only review dialog** showing the story's title, themes, and Situation/Task/Action/Result sections; the dialog includes an "Edit story" button that switches to the existing edit dialog.
4. **Remove the full story cards list** below the Common prompts / Themes grid — the clickable list inside the box replaces it.

## Technical notes

- Add `reviewing: StarStory | null` state alongside existing `draft`.
- New read-only dialog reuses `SECTIONS` labels; its Edit action sets `draft = story` and closes review.
- Review dialog stays in sync: editing from review and saving updates the story list as today.
- Verify with typecheck + authenticated Playwright screenshots of the Prepare step (list renders, click opens review, edit flows through).
