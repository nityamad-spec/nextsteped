## Include Weekly Quiz in Unit progress dots + counter

On `/student/home` collapsed Unit row, the row of dots and the "X / Y done" counter today only count activities (coding exercises / articles). The weekly quiz is factored into `isComplete` but has no dot of its own. Add the quiz as an additional item.

### Change (frontend only, `src/pages/student/StudentHome.tsx`, ~lines 645–699)

- Treat the weekly quiz as one extra item when `quizPublished` is true:
  - `quizCounts = quizPublished ? 1 : 0`
  - `totalCount = activities.length + quizCounts`
  - `doneCount = (activities done) + (quizPublished && quizDone ? 1 : 0)`
- Render one extra dot after the activity dots when `quizPublished`:
  - filled `bg-primary` if quiz taken & passed (>50%)
  - `bg-emerald-500` when it's the last dot AND all items done
  - `bg-muted-foreground/25` otherwise
- Keep `isComplete` logic identical (all activities done AND quiz done) — just derived from the new counts.
- Counter text unchanged in shape: `{doneCount} / {totalCount} done` (now naturally reflects quiz).

No changes to the expanded view, no data/DB changes, no changes to the activity toggle behavior.
