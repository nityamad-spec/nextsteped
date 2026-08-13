# Make "What's new" collapsible on Student Home

Make the `WhatsNewCard` on `/student/home` collapsible so students can hide the news grid while keeping the card header visible.

## Proposed behaviour

- The card header (title, date/course subtitle, and action buttons) remains visible when collapsed.
- A chevron toggle button is added to the header to expand/collapse the card body.
- Default state: expanded, so first-time users still see the feature.
- Persist the collapsed preference per course in `localStorage` under a key like `whats-new-collapsed:<courseId>`.
- When collapsed:
  - Hide loading skeletons, empty state, error state, and news grid.
  - Keep the "Refresh" button hidden (it only appears when results are shown and expanded).
  - If no news has been generated yet, the "Generate today's news" button is also hidden; the student must expand the card to generate.

## Files to change

- `src/components/student/WhatsNewCard.tsx`
  - Add `collapsed` state, initialized from `localStorage`.
  - Add a chevron icon button in the header next to the Refresh button.
  - Wrap `CardContent` in a conditional render / `AnimatePresence` block.
  - Update `Refresh` button placement so it only shows when expanded and items exist.
- `src/pages/student/StudentHome.tsx`
  - No changes required if all state lives inside `WhatsNewCard`.

## Open questions

1. card default to expanded 
2. collapsed preference reset on every page load?
3.  "Generate today's news" button remain accessible from the collapsed header

## Verification

- Typecheck.
- Browser check on `/student/home`: card toggles smoothly, content is hidden when collapsed, and preference persists after reload.