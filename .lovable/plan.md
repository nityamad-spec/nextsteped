# Fix: Student Home course name not matching professor's input

## Root cause
`src/pages/student/StudentHome.tsx` (line ~272) renders:
```ts
const courseName = currentCourse?.name || "Intro to Python";
```
`currentCourse` comes from `AppContext`, which is seeded from mock/local data and is not guaranteed to reflect the row the professor actually saved. When it's stale or empty, the UI falls back to the hardcoded `"Intro to Python"`, which is what the user is seeing.

The component already resolves `enrolledCourseId` and fetches the course row (for `start_date`, `total_weeks`, `lesson_plan_published_at`) inside the `loadPlan` effect — but it never reads `courses.name` from that query.

## Fix (frontend only, no backend changes)
1. In the existing `loadPlan` effect's `supabase.from("courses").select(...)` call, add `name` (and `code` for safety) to the selected columns.
2. Add `const [courseNameDb, setCourseNameDb] = useState<string | null>(null);` and set it from `course.name` when the query resolves.
3. Replace:
   ```ts
   const courseName = currentCourse?.name || "Intro to Python";
   ```
   with:
   ```ts
   const courseName = courseNameDb || currentCourse?.name || "";
   ```
   While loading (`courseNameDb === null` and `planLoading`), render a small skeleton/placeholder in the subtitle so we never flash the hardcoded `"Intro to Python"`.
4. Re-run the fetch whenever `enrolledCourseId` changes (already the effect's dep).

No changes to `AppContext`, no DB writes, no schema changes, no other files touched.

## Files
- `src/pages/student/StudentHome.tsx` — single edit.
