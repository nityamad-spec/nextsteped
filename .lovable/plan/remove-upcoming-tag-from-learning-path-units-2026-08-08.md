# Remove "Upcoming" Tag from Learning Path Units

## Goal
On `/student/learning-path`, stop displaying the "UPCOMING" status badge next to units that are scheduled for a future week. The "COMPLETE" badge should remain.

## Current State
In `src/pages/student/StudentLearningPath.tsx`, each unit row renders a status badge when `status !== "in_progress"`. This currently shows both "COMPLETE" for finished units and "UPCOMING" for units beyond the current course week.

The relevant block is around lines 328–332:

```text
{status !== "in_progress" && (
  <span className={`... ${statusStyles}`}>
    {statusLabel}
  </span>
)}
```

## Change
Update the badge condition to render only when `status === "complete"`. Keep the underlying `status` computation and avatar styling (check/lock/unit number) unchanged, since the lock icon is separate from the text badge.

## Files Affected
- `src/pages/student/StudentLearningPath.tsx` — one conditional change.

## Risks
None. This is a cosmetic label change only; unit visibility, expansion, and progress logic remain untouched.
