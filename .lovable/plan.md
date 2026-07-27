## Change
On `/student/learning-path`, the progress dots per unit currently light up in-place — dot #N fills only when activity #N is done, so completing "the last article" fills the rightmost dot. Change to a fill-from-left progress meter: the first N dots fill for any N completed items, regardless of which specific ones.

## File
`src/pages/student/StudentLearningPath.tsx`, lines ~299–329.

## Implementation
Replace the current dot rendering (which iterates `activities` + optional quiz dot and checks each item's `done` flag) with:

```tsx
const totalDots = totalCount; // activities.length + (quizPublished ? 1 : 0)
const filledDots = doneCount; // activitiesDoneCount + (quizTakenAny ? 1 : 0)
{Array.from({ length: totalDots }).map((_, i) => {
  const filled = i < filledDots;
  const cls = filled
    ? (isComplete ? "bg-emerald-500" : "bg-primary")
    : "bg-muted-foreground/25";
  return <span key={i} className={`h-2 w-2 rounded-full ${cls}`} />;
})}
```

The `doneCount` / `totalCount` numbers already exist. No changes to `activityDone`, quiz status, or the "N / M done" label. Tooltip on quiz dot is dropped (dots are no longer 1:1 with items) — the counter to the right already conveys progress.

## Scope
Frontend only, single file, single block.
