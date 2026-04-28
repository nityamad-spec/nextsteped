# Restructure storage paths to be course-scoped

Today every file in the `course-materials` bucket lives under `{teacherId}/...`. That couples files to the course **owner**, which breaks collaborators (they can't read or write the owner's folder) and makes course transfer impossible. The recent "Generate Lesson Plan badge stuck on In Progress for collaborators" bug was a symptom of this.

This plan moves all files under `{courseId}/...` and rewrites every code path, RLS policy, and stored path that depends on the old layout.

## New layout

```text
course-materials/
  {courseId}/
    syllabus/
      {timestamp}_original.pdf
      approved-syllabus.json
    lesson-plans/                 (raw uploaded plan docs)
      {timestamp}_handout.pdf
    teaching-materials/
      {timestamp}_slides.pdf
    lesson-plan/                  (generated plan JSON)
      published-plan.json
      draft-plan-v2.json
```

Folder names below the course id are unchanged; only the top-level `{teacherId}` segment is replaced with `{courseId}`.

## Dependencies that must change together

These all read or write the old path shape and must be updated in a single coordinated change. Anything missed will silently 404 or RLS-deny.

### 1. Storage RLS policies (`storage.objects`)
Current policies key off `(storage.foldername(name))[1] = auth.uid()`. New policies must key off course membership / enrollment:

- Teachers / collaborators read+write: `(foldername(name))[1]::uuid` is a course where `is_course_member(course_id, auth.uid())`.
- Students read (lesson-plan + syllabus + teaching-materials as appropriate): `(foldername(name))[1]::uuid` is a course the student is enrolled in.
- Admin policies stay as-is.
- Replace: `Users can view/update/delete own course-materials`, `Students can read lesson plan files`.

### 2. `courses` table — stored path columns
Three columns hold absolute storage paths and must be backfilled:
- `syllabus_json_path`
- `lesson_plan_path`
- `lesson_plan_draft_path`

All currently look like `{teacherId}/.../file.json`. Backfill rewrites the first segment to the row's `id`.

### 3. `course_material_files.storage_path`
Every row stores an absolute path starting with `{teacher_id}/`. Backfill rewrites to `{course_id}/...`. Rows with `course_id IS NULL` are orphaned and need a triage rule (delete or assign).

### 4. Frontend code
Files that hardcode `${user.id}/...` paths and must switch to `${courseId}/...`:
- `src/lib/lessonPlanPath.ts` — `legacyPublishedPath`, `legacyDraftPath`, `resolvePublishedPath`, `resolveDraftPath`, `fetchPublishedPath`. Signatures change from `(teacherId)` to `(courseId)`.
- `src/components/FileUploadZone.tsx` — `teacherId` prop becomes `courseId`; syllabus JSON write path; delete path.
- `src/pages/teacher/CourseMaterials.tsx` — `folderPath` props for syllabus and lesson-plans uploads; `expectedSyllabusJsonPath`.
- `src/pages/teacher/ContentLibrary.tsx` — syllabus JSON download path; `folderPath` for uploads.
- `src/pages/teacher/CourseCreation.tsx` — `draftStoragePath`.
- `src/pages/teacher/CourseSetup.tsx` — already DB-driven after the recent fix, but verify after column backfill.
- `src/hooks/useTeacherSetupStatus.ts` — comment + any path checks.

### 5. Edge functions
- `supabase/functions/chat/index.ts` — line 89 builds `${teacherId}/syllabus/approved-syllabus.json`. Must use `course_id` (resolve via the chat session's `course_id`).
- `supabase/functions/suggest-concepts/index.ts` — line 73 fallback path uses `course.teacher_id`. Switch to `course.id`.
- `supabase/functions/generate-lesson-plan/index.ts` — already reads `course.syllabus_json_path` from DB, but verify it uses the value as-is (no teacher-id assumption) and that `course_material_files.storage_path` it iterates over has been backfilled.

### 6. Anywhere reading `course_material_files.storage_path`
After backfill, downloads should "just work" because the row stores an absolute path. Confirm `generate-lesson-plan` and `CourseMaterials` listing don't rebuild paths from `teacher_id` anywhere.

## Migration steps

1. **Schema migration**: add new RLS policies on `storage.objects` for the course-id layout; keep the old policies temporarily so existing files remain accessible during cutover.
2. **Data migration (one-off SQL)**:
   - For each row in `storage.objects` where `bucket_id='course-materials'` and the first segment is a `teacher_id`, look up the matching course (via `course_material_files.storage_path` join, or for the JSON files via `courses.{syllabus_json_path,lesson_plan_path,lesson_plan_draft_path}`) and rename the object to `{course_id}/<rest>`. Use `storage.objects` `UPDATE name = ...` (Supabase storage supports renaming via metadata move; if not, do `INSERT new + DELETE old` via an edge function with the service role).
   - `UPDATE courses SET syllabus_json_path = regexp_replace(syllabus_json_path, '^[^/]+/', id || '/')` and likewise for `lesson_plan_path`, `lesson_plan_draft_path`.
   - `UPDATE course_material_files SET storage_path = regexp_replace(storage_path, '^[^/]+/', course_id || '/') WHERE course_id IS NOT NULL`.
   - Triage rows with `course_id IS NULL` (currently we should check; see Risks).
3. **Code change** (single PR): all file/edge-function edits in section 4 and 5; switch `lessonPlanPath.ts` API to take `courseId`.
4. **Drop old RLS policies** once code is deployed and all files have been moved.
5. **Smoke test** as both an owner and a collaborator: upload syllabus, generate plan, publish plan, view in Content Library, student view of lesson plan.

## Current data footprint

- 6 objects in `course-materials` (4 under `lesson-plan/`, 2 under `syllabus/`), spread across 2 distinct teacher-id top folders.
- Small enough to migrate in one transaction; risk of partial migration is low but still real.

## Risks

1. **Storage rename is not transactional with DB updates.** If the object move succeeds but the `courses`/`course_material_files` UPDATE fails (or vice versa), paths in the DB will point to non-existent files. Mitigation: do the SQL UPDATE first inside a transaction, then move objects; if a move fails, the DB still reflects the *new* path and the move can be retried idempotently. Or wrap the whole thing in an edge function with the service role and rollback on error.
2. **Orphan `course_material_files` rows with `course_id IS NULL`.** These can't be re-pathed because we don't know which course they belong to. Decision needed: delete, or assign to the teacher's most recent course.
3. **Live users mid-upload during migration.** A teacher uploading while we move files could end up with a row written under the new layout while RLS still expects the old one (or vice versa). Mitigation: keep both old and new RLS policies active during the migration window and only drop the old ones after verifying no recent writes use them.
4. **Cached signed URLs / in-flight downloads** pointing at old paths will 404 after the move. Acceptable — they regenerate on next render.
5. **Edge functions deployed before frontend (or vice versa).** A frontend that writes to `{courseId}/...` while `chat` still reads `{teacherId}/...` will return empty syllabus context. Mitigation: deploy edge function changes and frontend changes in the same release; until then, edge functions can read from the DB column (`courses.syllabus_json_path`) which is backfilled and authoritative.
6. **Teacher transfer / multi-owner edge cases.** The new layout fixes collaborator access, but if `courses.teacher_id` ever changes, the old layout would have orphaned files; the new layout doesn't have this problem — another reason this is the right direction.
7. **RLS coverage gap for student access to syllabus/teaching materials.** Today, students only have a policy for `lesson-plan`. If product wants students to read other folders, that policy must be added explicitly during this change rather than implicitly inheriting from the old "owner folder" rule.
8. **Storage rename API.** Supabase JS supports `move()`; doing 6 moves is trivial, but at scale this becomes O(n) round-trips. Not a concern at current footprint.

## Out of scope

- Changing bucket name or visibility.
- Reorganising folder names below the course id (`syllabus`, `lesson-plan`, etc.).
- Per-collaborator audit trail of who uploaded what (would need an `uploaded_by` column — already exists as `teacher_id` on `course_material_files`, keep it).
