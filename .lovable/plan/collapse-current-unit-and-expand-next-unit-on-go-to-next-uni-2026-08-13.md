# Collapse current unit and expand next unit on "Go to next unit"

On `/student/learning-path`, when a student clicks the **Go to Unit X+1** button inside an expanded unit card, collapse the current unit and expand the target unit in one action.

## What the student sees

- Inside a ready unit's expanded card, the **Go to Unit X+1** button remains visible (hidden on the last unit, as today).
- After clicking it, the current unit's card collapses and the next unit's card expands, so the page scroll focus moves to the new unit.
- Manual accordion toggles (clicking the unit header) keep working as before and are unaffected.

## What changes

1. `src/pages/student/StudentLearningPath.tsx`
   - Update the `onGoToNextUnit` handler passed to `UnitPathwayCard`.
   - Current behavior: append `unit.day + 1` to `expandedWeeks`.
   - New behavior: remove `unit.day` from `expandedWeeks`, then add `unit.day + 1` if it is not already present.

No other components, hooks, or database tables need changes. The `UnitPathwayCard` prop signature stays the same.

## Edge cases handled

- If the next unit is already expanded, the current unit still collapses and the next unit stays expanded.
- Last unit never shows the button (existing `isLastUnit` guard in `UnitPathwayCard`).
- If a user has manually expanded other units, those remain untouched; only the current and next units are modified.

## Verification

- Typecheck.
- Browser check on `/student/learning-path`: click **Go to Unit X+1** inside a ready unit and confirm the current unit collapses while the next unit expands.
