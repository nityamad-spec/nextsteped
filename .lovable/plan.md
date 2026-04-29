## Fix "Identify concepts" silent failures

### Root cause
`suggest-concepts` returns `{ suggestions: [], units: [] }` (Status 200) whenever it can't extract units from the syllabus JSON. The UI treats that as "nothing to add" and shows a generic empty state, hiding the real problem. Three failure modes:

1. **Syllabus file not found** — only checks `course.syllabus_json_path` and one hardcoded fallback (`{courseId}/syllabus/approved-syllabus.json`). Other naming patterns silently fail.
2. **Unrecognized syllabus shape** — `normalizeUnits` only accepts `units` or `modules`. Shapes like `chapters`, `sections`, `weeks`, or top-level arrays return `[]`.
3. **All concepts dedup'd** — when AI returns only concepts that already exist, nothing is shown and no message explains why.

### Changes

**`supabase/functions/suggest-concepts/index.ts`**
- Expand `normalizeUnits` to accept `units`, `modules`, `chapters`, `sections`, `weeks`, and top-level arrays of unit-like objects.
- Expand syllabus discovery: try `course.syllabus_json_path`, the hardcoded fallback, then list all `.json` files under `{courseId}/syllabus/` and `{courseId}/` and pick the most recent one.
- Return a structured `reason` field alongside `warning`: `no_syllabus_file`, `unrecognized_shape`, `all_dedup`, or `ok`.
- Add server-side `console.log` for `courseId`, `candidatePaths` tried, which one matched, and `unitsFound` count.

**`src/pages/teacher/ConceptReview.tsx`**
- When the response has a `warning`/`reason`, surface it via `toast.warning(...)` instead of the generic empty state.
- Distinguish the three reasons with actionable messages (e.g. "No parsed syllabus found — re-upload your syllabus" vs. "All extracted concepts already exist").

### Out of scope
No DB schema changes. No changes to `recommend-additional-concepts` or other functions.