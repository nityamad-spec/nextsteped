# Fix "What to do today" stuck on loading

## What's happening

On the Skill Training Test course, the "What to do today" box shows "Loading your activities…" forever.

The section treats "the course has a published plan but no concept list yet" as "still loading". This course has a published six-week plan but its concept list is empty, so the box waits for something that will never arrive.

Confirmed from the live data: the plan is published, and the concepts request for this course returns an empty list.

## The fix

Treat an empty concept list as a finished load rather than a pending one:

- Track whether the concepts request has actually completed, and use that instead of "the list is non-empty".
- Once it completes with nothing, the cards render normally using the lesson plan units, exactly as they do for courses that do have concepts.
- Nothing else about the cards, ordering, quiz gating or the footer changes.

## Technical notes

- `src/pages/student/StudentHome.tsx`: add a `conceptsLoading` state set alongside the existing concepts fetch effect (true on start, false in every completion path including the error path and the "no course" early return). Replace the `concepts.length === 0 && lessonPlanPublished` term in `nextActionsLoading` with `conceptsLoading`.
- No backend, schema or query changes.
