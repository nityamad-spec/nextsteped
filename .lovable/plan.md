# Single source of truth for course storage files

Today `course_material_files` only tracks files uploaded through `FileUploadZone` (syllabus PDFs, materials, lesson-plan docs). Several system-generated artifacts in the `course-materials` bucket bypass the table, so wipes/deletes rely on hardcoded paths and can leak storage objects.

## Files currently NOT tracked

| File | Written by | Path |
|---|---|---|
| Parsed syllabus JSON | `FileUploadZone.parseSyllabusInBackground` | `${courseId}/syllabus/approved-syllabus.json` |
| Parsed syllabus JSON (server) | `extract-lesson-plan` edge function | `${courseId}/syllabus/approved-syllabus.json` |
| Lesson plan draft | `CourseCreation` (`draftStoragePath`) | `${courseId}/lesson-plan/draft-plan-v2.json` |
| Lesson plan published | `TeachingPlan` + `CourseCreation` | `${courseId}/lesson-plan/published-plan.json` |

## Goal

1. Every write to the `course-materials` bucket inserts/upserts a row in `course_material_files` with `course_id` FK.
2. Every delete (`wipe-syllabus-cascade`, `delete-course`, per-file UI delete) fetches storage paths from `course_material_files` for the course, removes them from storage, then deletes the rows.
3. No hardcoded canonical paths in delete logic.

## Stage-by-stage changes

### A. Schema (migration)

Add two derived `folder_type` values used by system artifacts (string column today — no enum change needed, just convention):

- `syllabus-json` — parsed syllabus JSON
- `lesson-plan-draft` — draft plan JSON
- `lesson-plan-published` — published plan JSON

Add a partial unique index so re-uploads upsert cleanly instead of duplicating rows:

```sql
CREATE UNIQUE INDEX course_material_files_course_path_uniq
  ON public.course_material_files (course_id, storage_path);
```

No new tables; existing RLS already covers teacher/admin access.

### B. Register system-generated uploads

Add a small helper used by both client and edge functions:

```ts
// register a file row after a successful storage upload
upsertCourseMaterialFile({ course_id, teacher_id, storage_path, file_name, file_size, folder_type })
// onConflict: (course_id, storage_path) → updates file_size + updated_at
```

Wire it into every existing storage write:

- `src/components/FileUploadZone.tsx` line 270-282 — after uploading `approved-syllabus.json`, upsert row with `folder_type='syllabus-json'`.
- `src/pages/teacher/CourseCreation.tsx` lines 538 (draft) and 891 (published) — upsert with `lesson-plan-draft` / `lesson-plan-published`.
- `src/pages/teacher/TeachingPlan.tsx` line 242 (published) — same as above.
- `supabase/functions/extract-lesson-plan/index.ts` line 258 — service-role upsert with `syllabus-json` after writing parsed JSON.

### C. Delete logic — derive paths from the table

**`supabase/functions/wipe-syllabus-cascade/index.ts`**
Replace the three hardcoded storage steps (`syllabus_file`, `syllabus_json`, `lesson_plan_storage`) with a single `storage_files` step:

1. `SELECT storage_path FROM course_material_files WHERE course_id = ?` → `paths[]`.
2. `dryRun` → return `{ wouldRemoveFiles: paths.length, paths }`.
3. Else `storage.from("course-materials").remove(paths)` (chunk to 1000 if needed); ignore per-file `NotFound`.
4. `DELETE FROM course_material_files WHERE course_id = ?` (count rows removed).

Drop the `syllabusStoragePath`, `lessonPlanPath`, `lessonPlanDraftPath` inputs from the request body (or accept-and-ignore for back-compat). Update the verify step to also assert `course_material_files` count is `0`.

**`supabase/functions/delete-course/index.ts`**
Already fetches `storage_path` from the table — keep that pattern, just no behavioral change needed beyond confirming it now picks up the newly-registered system files.

**`src/pages/teacher/ContentLibrary.tsx`** per-file delete — unchanged (already row-driven).

### D. Client invalidation

Extend `WipeEventDetail.scopes` already includes `materials`; no new scope needed. The wipe call site (`AdminSetupDebug` / `FileUploadZone`) keeps emitting `materials` after the consolidated step succeeds.

## Files to change / add

- `supabase/migrations/<ts>_course_material_files_unique.sql` — partial unique index.
- `src/lib/courseMaterialFiles.ts` (new) — `upsertCourseMaterialFile` helper for client.
- `src/components/FileUploadZone.tsx` — register `approved-syllabus.json`.
- `src/pages/teacher/CourseCreation.tsx` — register draft + published lesson plan JSON.
- `src/pages/teacher/TeachingPlan.tsx` — register published lesson plan JSON.
- `supabase/functions/extract-lesson-plan/index.ts` — register parsed JSON server-side.
- `supabase/functions/wipe-syllabus-cascade/index.ts` — collapse storage steps; drive from table.
- `supabase/functions/delete-course/index.ts` — no logic change; add verify log line.

## Out of scope

- Backfill of existing courses whose syllabus JSON / lesson plan JSON were uploaded before this change. (Optional follow-up: one-off admin button "Reconcile storage" that lists the bucket prefix and inserts missing rows.)
- Renaming `folder_type` to an enum.
- Tracking lesson-plan source documents uploaded to a different bucket (`LESSON_PLAN_BUCKET`) — confirm whether that bucket should also be reconciled; if yes, add a `bucket` column. **Open question below.**

## Open question

The lesson-plan JSON in `TeachingPlan.tsx` / `CourseCreation.tsx` is uploaded to `LESSON_PLAN_BUCKET` (not `course-materials`). Two options:
1. **Add a `bucket` column** to `course_material_files` (default `'course-materials'`) and register cross-bucket. Deletes group by bucket.
2. **Keep table single-bucket** and continue handling `LESSON_PLAN_BUCKET` separately in delete code.

Recommended: option 1 — true single source of truth, minimal schema change, future-proof.
