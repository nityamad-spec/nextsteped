# Progress-aware loading UI for /teacher/analytics

The page already renders 3 skeleton bars, but they look static and give no signal that a large multi-stage fetch is running. Add a proper loading indicator with a spinner, live stage label, and a determinate progress bar that reflects the actual query pipeline in `CourseAnalyticsView`.

## Changes

### `src/components/CourseAnalyticsView.tsx`

1. Add a `loadingStage` state alongside `loading`:
   ```ts
   type Stage = "idle" | "course-data" | "students" | "chat" | "computing" | "done";
   const [loadingStage, setLoadingStage] = useState<Stage>("idle");
   ```

2. Update `load()` to set the stage before each phase:
   - `"course-data"` before the `Promise.all` (enrollments, diagnostics, mastery, exams, results, chat sessions)
   - `"students"` before the profiles + universities fetch
   - `"chat"` before the paginated chat-messages loop
   - `"computing"` right before `setRaw(...)`
   - `"done"` in the `finally` after `setLoading(false)`

3. Replace the current three-skeleton block with a new `<AnalyticsLoading stage={loadingStage} />` component:
   - Centered card with `Loader2` spinner (animate-spin)
   - Title: "Loading course analytics"
   - Sub-label reflecting the current stage (e.g. "Fetching enrollments, diagnostics and exam results…", "Loading student profiles…", "Aggregating chat activity…", "Calculating mastery and engagement…")
   - A `<Progress />` bar (shadcn) with values 15 / 45 / 70 / 90 / 100 mapped to the stages so the bar visibly advances
   - Muted footnote: "This can take several seconds for large courses."

### `src/pages/teacher/CourseAnalytics.tsx`

Wrap the initial course fetch (the courses + profiles lookup) in the same loading treatment so the professor never sees a blank page during the initial ~200ms round-trip either. Show a lightweight "Preparing course…" spinner card while `loading && !course`.

## Out of scope

- No query optimizations, no schema changes, no caching. This plan is UI-only.
- No changes to the admin `CourseProfileDialog`; it will inherit the same improved loading UI automatically since it reuses `CourseAnalyticsView`.

## Verification

- Open `/teacher/analytics` with a large course → spinner appears immediately, stage label cycles through Fetching → Loading students → Aggregating chat → Calculating, progress bar advances, then real content renders.
- Small course still shows briefly (no flicker regression).
- Admin `CourseProfileDialog` shows the same indicator inside the dialog.
