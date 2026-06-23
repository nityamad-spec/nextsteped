## Fix: "Week 4" badge wrapping on Lesson Plan

**File:** `src/pages/student/StudentHome.tsx` (~line 583)

The Week badge in the Lesson Plan accordion uses `w-16` with default badge padding, causing "Week 4" to wrap onto two lines on narrower widths.

**Change:** Add `whitespace-nowrap` to the badge and widen it slightly so single- and double-digit weeks both fit on one line.

```tsx
<Badge
  variant={dp.day === currentWeek ? "default" : "outline"}
  className="shrink-0 text-xs w-[72px] justify-center whitespace-nowrap"
>
  Week {dp.day}
</Badge>
```

No other UI or logic changes.