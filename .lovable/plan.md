## Current behavior

In `src/pages/teacher/CourseDashboard.tsx`, the mount effect calls `loadInsights(false)`. That path reads the cached row from `course_teaching_insights` but only uses it if it exists **and** is <6h old. Otherwise it falls through to `supabase.functions.invoke("generate-teaching-insights", …)`. So a reload with no cache row, or with a stale (>6h) cache row, regenerates insights — which violates the "only on Refresh" contract.

## Goal

- **Page load** → only read the cached row. Never invoke the edge function.
- **Refresh button** → invoke the edge function with `force_refresh: true`.
- Stale cache still renders, with the existing "Updated Xh ago" label signaling freshness.
- First-time professors (no cache row yet) see an empty state that points them to the Refresh button.

## Changes (single file: `src/pages/teacher/CourseDashboard.tsx`)

1. Split `loadInsights` into two functions:
   - `loadCachedInsights()` — runs on mount. Performs the existing `student_concept_mastery` count short-circuit, then selects from `course_teaching_insights`. Renders the cached row regardless of age. If no row exists, sets a new `insightsNeverGenerated` flag. **Never invokes the edge function.**
   - `refreshInsights()` — only called by the Refresh button. Keeps the current `supabase.functions.invoke(..., { force_refresh: true })` call, error toast, and state updates.
2. Update the `useEffect([courseId])` to call `loadCachedInsights()` instead of `loadInsights(false)`.
3. Update the Refresh button `onClick` to call `refreshInsights()`. Keep it disabled while refreshing or when `insightsEmpty` (no mastery data).
4. Empty-state copy:
   - `insightsEmpty` (no student mastery data): keep current message.
   - `insightsNeverGenerated && !insightsEmpty`: "No insights generated yet. Click Refresh to generate."
5. No edge-function, schema, or RLS changes.

## Risks & mitigations

- **Stale insights shown indefinitely** → the existing "Updated Xh ago" timestamp signals staleness; professor controls regeneration via Refresh.
- **First-time professors see an empty panel** → explicit empty-state copy directs them to Refresh.
- **Concurrent refresh clicks** → existing `insightsRefreshing` guard already disables the button.

## Verification

- Reload with an existing cache row → insights render from cache; no `generate-teaching-insights` network call.
- Reload with no cache row → empty state with "Click Refresh"; no edge-function call.
- Click Refresh → exactly one call to `generate-teaching-insights`; timestamp updates.
- Reload immediately after → cache hit, no edge-function call.
- Reload with cache row older than 6h → still renders cached insights; no edge-function call.
