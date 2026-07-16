## Changes to `src/components/CourseAnalyticsView.tsx`

### 1. Course mastery: show measured-student count (including "No data")

In the "Course mastery" header (currently shows only `Avg: XX%`), add a leading count of students the bands cover — which equals `stats.enrolled` since every enrolled student is bucketed into one of Beginner/Developing/Proficient/Expert/No data.

Header becomes:
```
Course mastery      Students: N (incl. no data)  ·  Avg: XX%
```

Where `N = stats.enrolled = sum(masteryBands)`. No data change needed — the sum is already exact.

### 2. Course completion: add "% Proficient+" beside Not completed

Add a third derived stat displayed in the Course-completion card header (right-hand side) and as a small caption next to the "Not completed" tile:

```
Course completion                       {completedPct}% of {enrolled}  ·  Proficient+: {profPct}%
```

Where:
```
proficientPlus = masteryBands.proficient + masteryBands.expert
profPct        = round(proficientPlus / enrolled * 100)   // 0 when enrolled = 0
```

Also add a one-line caption under the two tiles:
> `{proficientPlus}/{enrolled} students ({profPct}%) reached Proficient or Expert mastery.`

Both values come from existing `stats.masteryBands` — no new fetches, no new state.

### Out of scope
- No changes to any other card, roster dialog, exports, or backend.
- No new roster view (Proficient/Expert rosters are already reachable from the mastery band buttons).
