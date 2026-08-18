# Fix the course analytics crash on /admin/courses

## Root cause (verified)

`src/components/CourseAnalyticsView.tsx` accepts `course: CourseLite | null` (line 57). Every other usage reads it defensively (`course?.name`, `course?.term`, ...), except line 779:

```tsx
<ProctoringLocksCard courseId={course.id} />
```

This was added with the proctoring-locks card and is the only unguarded read — it matches the reported error `Cannot read properties of null (reading 'id')` in `CourseAnalyticsView`.

It becomes reachable because the admin dialog passes `course={open ? course : null}` (`src/components/admin/CourseProfileDialog.tsx:40`), while the fetch effect bails out on null (`if (!course) return;` at line 236) without clearing `raw`/`stats`. So on dialog close the component re-renders with `course === null` but stale `stats` still set, taking the loaded branch at line 552 and hitting `course.id`.

## Fix

1. In `CourseAnalyticsView.tsx`, render the proctoring card only when a course is present:
   `{course && <ProctoringLocksCard courseId={course.id} />}`
2. In the same file, when `course` is null, clear the loaded state in the fetch effect (reset `raw`/`stats` and loading stage) so the component falls back to the loading/empty branch instead of showing stale data from the previously opened course.

## Verification

- Open a course on `/admin/courses`, close the dialog, reopen a different course: no runtime error, and the second course shows fresh numbers rather than the previous course's stats.
- `/teacher/analytics` (non-null course) still renders the Proctoring locks card unchanged.
- Run the frontend test suite to confirm no regressions.

## Notes

Presentation/guard change only; no data model or query changes.
