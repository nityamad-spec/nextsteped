## Problem

Two issues observed:

1. `lesson_plan_weeks` currently has rows for course IDs that no longer exist in `courses` (`2eb56e1d…`, `808605a6…`). These are orphans from past course deletions — the `wipe-courses` / `delete-course` paths didn't clean them up, and there is no FK to enforce it.
2. The cascade-wipe on syllabus delete relies entirely on the edge function deleting from each table by `course_id`. If any step fails silently or the function isn't invoked (e.g. user dismissed dialog, network drop after partial run), child rows are stranded.

Root cause: course-scoped child tables have **no foreign key** to `courses(id)`. Inspecting the schema dump confirms `concepts`, `lesson_plan_weeks`, `diagnostic_questions`, `assessment_questions`, `course_material_files`, `course_ta_settings`, `course_teachers`, `enrollments`, `teacher_setup_progress`, etc. all reference `course_id` as a plain `uuid` with no FK constraint.

## Fix

### 1. Migration: add FKs with `ON DELETE CASCADE`

Add a foreign key from each course-scoped child table to `courses(id) ON DELETE CASCADE`. This makes the database the source of truth — deleting a course (or wiping its data through any path) reliably removes children.

Tables to constrain (all FK `course_id → courses(id) ON DELETE CASCADE`):

- `lesson_plan_weeks`
- `concepts`
- `diagnostic_questions`
- `assessment_questions`
- `assessment_results`
- `diagnostic_results`
- `course_material_files`
- `course_ta_settings`
- `course_teachers`
- `enrollments`
- `teacher_setup_progress`
- `chat_sessions` (nullable course_id → use `ON DELETE SET NULL`)
- `student_feedback` (nullable → `SET NULL`)
- `pending_signups` (nullable → `SET NULL`)

For each: drop any pre-existing constraint of same name (idempotent), then `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE` (or `SET NULL` for nullable cases).

### 2. Pre-migration cleanup of existing orphans

Before adding the FKs (which would otherwise fail), delete orphan rows where `course_id` does not exist in `courses`:

```sql
DELETE FROM lesson_plan_weeks WHERE course_id NOT IN (SELECT id FROM courses);
-- repeat for each table above
```

For nullable-course tables (`chat_sessions`, `student_feedback`, `pending_signups`), set the dangling `course_id` to NULL instead of deleting rows.

### 3. No application code changes required

The cascade-wipe edge function (`wipe-syllabus-cascade`) and `delete-course` keep working as today; the FKs are an extra safety net so a partial failure or future code path can't leave orphans.

### Verification

After migration:
- `SELECT count(*) FROM lesson_plan_weeks WHERE course_id NOT IN (SELECT id FROM courses)` → 0
- Manually delete a test course → confirm related rows in all child tables disappear automatically.
- Re-run the syllabus cascade wipe → confirm `lesson_plan_weeks` empties.

### Out of scope

- No UI changes.
- No edge function changes.
- Storage objects (`course-materials/{courseId}/…`) are not covered by FK cascade and remain the edge function's responsibility — already handled in `wipe-syllabus-cascade` and `delete-course`.
