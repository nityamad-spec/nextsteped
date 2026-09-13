# Learning Path cleanup + recent mock reviews

## 1. Remove the "You're here" card

Delete the card recently added at the top of the Learning Path page. It was only
added there, so nothing else needs reverting. The existing course-progress card
on academic courses stays exactly as it was.

## 2. Locked units read as locked

On the path rail, units past the one the student can act on (the first unit
below the 90% mastery goal) are shown in a muted gray: gray number circle,
gray label, no colour accent. They stay clickable, and the detail panel keeps
the locked state it already has.

## 3. "You're here" marker only on the real unit

Right now, opening Stage 2 marks its first unit (Unit 4) as "You're here"
because the rail falls back to the first unit in the stage. Fix: the marker
appears only on the student's actual current unit. In a stage that does not
contain it, no unit gets the marker and the green progress fill is empty.

## 4. Recent mocks open a review page

Each row under "Recent mocks" in Career Readiness → Practice becomes clickable
and opens a full review page for that mock, showing:

- Mock type, when it was taken, score, and time used against the target length
- Coach-checklist completion with the items that were missed
- The same feedback notes shown at the end of a live mock session
- A recording panel placeholder (demo only — no actual playback)
- A "Back to mock lab" button

Demo-only, nothing saved; refreshing returns to the lab.

## Technical notes

- `src/pages/student/StudentLearningPath.tsx`: remove the `hereUnit` /
  `hereStage` / `hereMastery` block and its card; pass `lockedDays` (or
  `activeUnit`) to `UnitPathRail`; pass `currentDay` as-is and let the rail
  handle a current unit outside the given `days`.
- `src/components/student/UnitPathRail.tsx`: treat `currentDay` not present in
  `days` as "no current unit" (no pill, zero fill); add a locked style branch
  for units after the active one.
- `src/lib/mockInterviews.ts`: extend `RecentMock` with the review fields
  (minutes target, elapsed, checklist completion) needed by the review page.
- New `src/components/student/employment/MockReviewScreen.tsx`, reusing the
  review layout and notes from `CodingMockSession`; `MockInterviewLab.tsx`
  gains a `reviewMock` state and renders it.
- Unit tests for the rail's locked/current logic and for opening a recent mock
  review; TypeScript check and authenticated Playwright screenshots.
