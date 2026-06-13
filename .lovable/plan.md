# Root cause

The lesson plan JSON survives the cascade wipe and gets re-loaded by `/teacher/setup/lesson-plan` on next mount.

Chain of events:

1. `TeachingPlan.savePlan` / `handlePublish` uploads `{courseId}/lesson-plan/published-plan.json` to storage, then calls `upsertCourseMaterialFile({ folder_type: "lesson-plan-published", ... })` to register it in `course_material_files`.
2. That upsert **always fails** with:
   ```
   there is no unique or exclusion constraint matching the ON CONFLICT specification
   ```
   The supporting index `course_material_files_course_path_uniq` is a **partial** unique index (`WHERE course_id IS NOT NULL`). PostgREST's `onConflict: "course_id,storage_path"` cannot infer a partial index without the predicate, so the upsert is rejected and the row is never written. (The console logs confirm this for `approved-syllabus.json` and `draft-plan-v2.json` too — same root cause for all of them.)
3. `wipe-syllabus-cascade` phase 5 ("storage_files") only removes objects whose paths are listed in `course_material_files`. Because the published plan JSON was never registered, it is **left in the bucket**.
4. `courses.lesson_plan_path` is cleared by the cascade, but `resolvePublishedPath` falls back to the canonical path `{courseId}/lesson-plan/published-plan.json` — which is exactly the orphaned file. `TeachingPlan` downloads and renders it, so the previous plan reappears.

The in-tab `subscribeWipe` listener works correctly; it triggers the same load path, which still finds the leftover file.

# Fix

Two complementary changes — neither alone is sufficient long-term:

### 1. Make the unique index a real (non-partial) unique constraint

`course_id` is `NOT NULL` in practice for every row we write, so the `WHERE course_id IS NOT NULL` predicate adds nothing but breaks `ON CONFLICT` inference.

Migration:

```sql
-- Drop the partial index and replace with a true unique constraint so
-- PostgREST upserts with onConflict=(course_id,storage_path) succeed.
DROP INDEX IF EXISTS public.course_material_files_course_path_uniq;

ALTER TABLE public.course_material_files
  ALTER COLUMN course_id SET NOT NULL;

ALTER TABLE public.course_material_files
  ADD CONSTRAINT course_material_files_course_path_uniq
  UNIQUE (course_id, storage_path);
```

(If any existing rows have `course_id IS NULL` we'll first delete them — none expected based on current writers, but the migration will check.)

After this, the existing `upsertCourseMaterialFile` calls succeed, so every published/draft plan + approved syllabus JSON written from now on is registered and therefore wiped by the cascade.

### 2. Belt-and-suspenders cleanup in `wipe-syllabus-cascade`

Even after the constraint is fixed, orphaned files from before today exist in many courses. Extend the `storage_files` step to also explicitly remove the well-known canonical lesson-plan and syllabus-JSON paths, regardless of whether they appear in `course_material_files`:

```ts
const extraPaths = [
  `${courseId}/lesson-plan/published-plan.json`,
  `${courseId}/lesson-plan/draft-plan-v2.json`,
  `${courseId}/syllabus/approved-syllabus.json`,
];
const allPaths = Array.from(new Set([...paths, ...extraPaths]));
```

Use `allPaths` for the storage `remove` call. `STORAGE_NOT_FOUND` is already treated as success, so listing paths that don't exist is harmless.

### 3. (Optional safety) Defensive client behaviour

No change required in `TeachingPlan.tsx` — once the file is gone, the existing load path correctly falls through to `setDays([])`. The `?t=${Date.now()}` "cache-bust" appended inside `download(...)` is a no-op (Supabase storage treats the whole string as the object key), but it doesn't cause this bug; it can be cleaned up separately if desired, not part of this fix.

# Files touched

- New SQL migration (constraint swap on `course_material_files`).
- `supabase/functions/wipe-syllabus-cascade/index.ts` — extend storage step path list.

No UI/component changes needed.
