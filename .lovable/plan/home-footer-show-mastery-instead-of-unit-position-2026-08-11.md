# Home footer: show mastery instead of unit position

## What changes

On `/student/home`, in the "What to do today" card footer, replace the two stats:

- Left: `Unit 1 of 2` / "Current position" becomes the unit's readiness percentage, e.g. `48% mastery` under the label "Current position".
- Right: `Quiz not taken` / "Status" becomes `70% mastery` under the label "Goal".

The percentage comes from the same readiness value the learning path already shows for the focused unit (concept-mastery weighted), and the goal uses the existing 70% readiness threshold rather than a hardcoded number.

If the student has no mastery data for the focused unit yet, the left value shows `0% mastery`.

## Technical detail

- `src/pages/student/StudentHome.tsx`: change the `focusFooter` object built in the next-action logic from `{ position, status }` to `{ current, goal }`, sourcing `current` from `readinessByUnit[focusUnit] ?? 0` and `goal` from `READINESS_THRESHOLD`.
- Update the footer JSX in the same file to render the new values and the labels "Current position" and "Goal".
- No backend, hook, or learning-path changes.
