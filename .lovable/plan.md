## Lesson Plan Unit header redesign (/student/home)

Redesign the collapsed Unit row in the Lesson Plan card to match the reference screenshot. No XP, no DB changes.

### New collapsed row layout

```
[◯✓]   UNIT 1   Interacting with Google Cloud   [COMPLETE]                    ⌄
       ● ● ● ●   3 / 3 done
```

- Left: circular soft-green avatar with a checkmark (complete) / hollow ring (in progress) / muted lock-less ring (upcoming).
- Top line: small-caps `UNIT {n}` label + bold unit name + status pill on the right of the name:
  - `COMPLETE` — soft green
  - `IN PROGRESS` — soft primary/blue (current unit)
  - `UPCOMING` — soft muted (future units)
- Second line: one filled dot per activity + `X / Y done` text. Dots use primary color when done; the final dot flips green when `X === Y`. Undone dots are muted.
- Right: existing chevron up/down.
- Drop the current `Unit N` badge and separate `Current` pill (folded into the new status pill + avatar).

### Completion logic

A Unit is COMPLETE when **all activities in that unit are marked done AND the unit's weekly quiz is passed** (or no quiz exists for that unit). Since there's no server-side activity-completion tracking today and this request has no DB changes:

- Persist activity completion in `localStorage` under `student:activity-done:{userId}:{activityId}` (boolean).
- Expose a `toggleActivityDone(activityId)` handler; clicking the activity's left check-circle in the expanded view toggles done. Existing link/click-through behavior on the activity row is preserved (toggle lives on the icon only).
- Derived per unit:
  - `doneCount` = activities with localStorage flag true
  - `totalCount` = `dp.resources.length`
  - `quizDone` = `takenQuizzes[dp.day]?.score > 50` OR `!availableQuizDays.has(dp.day)`
  - `status` = `doneCount === totalCount && quizDone` → COMPLETE; else if `dp.day === currentWeek` → IN PROGRESS; else if `dp.day > currentWeek` → UPCOMING; else IN PROGRESS.

Activities inside the expanded view also get a strikethrough + green check when marked done (matches the reference's second screenshot styling — nothing else in the expanded view changes).

### Files

- `src/pages/student/StudentHome.tsx` — replace the collapsed-row markup in the `lessonPlan.map(...)` block (≈lines 621–641), add small helpers for per-unit derived counts + localStorage toggle, and add the done-state styling to activity rows inside the expanded view (≈lines 677–709). No changes to data loading, quiz logic, or any other section.

### Out of scope

- XP counters (explicitly ignored).
- Server-side persistence of activity completion (localStorage only for now — can be moved to DB later).
- Any change to the expanded-view Learning Outcomes, Concept groups layout, or the Weekly Quiz block itself.
