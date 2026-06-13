# Harden `wipe-syllabus-cascade`

Bring the cascade wipe to parity with `delete-course` (minus the course row itself), add safety rails, and make every run observable.

## Goals
1. Full FK coverage so no derived rows are orphaned.
2. Deterministic delete order driven by the FK graph.
3. Dry-run mode that reports impact without mutating.
4. Structured per-run audit log persisted to DB.
5. Robust error classification (no regex matching on driver messages).
6. Tightened scoping (filter by `course_id` everywhere possible).

---

## Stage-by-stage changes

### A. Deletion coverage (parity with `delete-course`)
Add the following tables to the wipe pipeline, ordered by FK dependency:

```text
assessment_results        (FK -> assessment_questions, concepts, course)
assessment_questions      (FK -> concepts)
diagnostic_results        (FK -> diagnostic_questions, course)
diagnostic_questions      (FK -> concepts)
student_concept_mastery   (FK -> concepts, student, course)
student_course_mastery    (FK -> course)
concepts                  (FK -> course)
lesson_plan_weeks         (FK -> course)
course_teaching_insights  (FK -> course)
course_youtube_links      (FK -> course)
course_ta_settings        (FK -> course)
course_material_files     (filter by course_id AND storage_path)
teacher_setup_progress    (FK -> course)
cache_versions            (scope='course', scope_id=courseId)
chat_messages / chat_sessions  (only when user opts into "wipe chat history")
```

Keep these out of scope (course itself is preserved):
- `courses` row
- `enrollments`, `course_teachers`, `pending_signups`, `profiles.active_course_id`, `teacher_applications.assigned_course_id`

Each table gets its own `runStep("delete_<table>")` so the report shows row-level granularity.

### B. Order & FK safety
Pre-compute the order from the FK graph (hard-coded constant in the file with a comment). Group into phases:
1. **Results / mastery** (leaf rows)
2. **Questions** (assessment + diagnostic)
3. **Concepts**
4. **Lesson plan + insights + youtube + TA settings**
5. **Materials (DB + storage)**
6. **Course flags reset + cache bump**
7. **Setup progress**

### C. Storage scoping
- `course_material_files`: filter `eq("course_id", courseId).eq("storage_path", syllabusStoragePath)` before delete.
- Add a `course_materials_orphans` cleanup step that deletes any `course_material_files` rows for the course whose `storage_path` is no longer in storage (best-effort, logged).

### D. Error handling
Replace `/not.*found/i.test(err.message)` with explicit checks:
- Storage: treat HTTP 404 / `statusCode === '404'` / `error.name === 'NotFound'` as soft-skip.
- DB: map Postgres `code` (`23503` FK violation, `23505` unique, `42501` permission) and surface as `errorCode` in `StepResult`.

Extend `StepResult` to include `{ errorCode?: string, postgresCode?: string }`.

### E. Dry-run mode
Accept `{ dryRun: true }` in the body. When set:
- All `delete()` calls become `select("id", { count: "exact", head: true })`.
- Storage `remove` becomes `list` to count matching objects.
- `course_flags`/`bump_cache_version` are skipped; response includes a `wouldUpdate` map.
- Response shape unchanged (`steps[*].details.wouldDelete = N`).

### F. Audit log
New table `wipe_audit_log`:
- `id`, `course_id`, `user_id`, `dry_run boolean`, `ok boolean`, `started_at`, `finished_at`, `duration_ms`, `steps jsonb`, `error text`.
- Service-role insert at end of every run (success or failure).
- RLS: admin select-all; teachers select rows for courses they own/collaborate on.

### G. Verify step expansion
Add to the existing `verify` step:
- `assessment_results`, `diagnostic_results`, `student_concept_mastery`, `student_course_mastery`, `course_teaching_insights`, `course_youtube_links`, `course_ta_settings`, `cache_versions` (scope=course).

### H. Client invalidation
Extend `WipeEventDetail.scopes` union with `"mastery" | "insights" | "ta_settings"` and emit them from the wipe call site so dependent views refresh.

---

## Files to change / add

- `supabase/functions/wipe-syllabus-cascade/index.ts` — full rewrite of step pipeline, dry-run support, structured errors, audit insert.
- `supabase/migrations/<ts>_wipe_audit_log.sql` — new table + GRANTs + RLS + policies.
- `src/lib/wipeEvents.ts` — extend scopes union.
- Call site of `wipe-syllabus-cascade` (admin/setup-debug page) — pass new scopes; surface dry-run toggle + audit results.
- `src/pages/admin/AdminSetupDebug.tsx` — add "Dry run" checkbox + "Recent wipes" tab reading from `wipe_audit_log`.

## Technical notes
- Keep `runStep` continue-on-failure semantics — never abort mid-pipeline.
- Wrap everything except `auth/validate_input/authorize` so a single bad step doesn't hide the rest.
- Service-role client is unchanged; no schema-grant changes for existing tables.
- Cache bump remains best-effort, but now also bumps `cache_versions` for `scope='concepts'` and `scope='questions'`.

## Out of scope
- True DB transaction across all deletes (not feasible across storage + RPC + multiple tables).
- Soft-delete / undo. Wipe remains destructive; dry-run is the safety net.

## Open question
Should chat history (`chat_sessions` + `chat_messages` for this course) be wiped by default, opt-in, or never? Current `delete-course` wipes it, but a syllabus re-upload may want to preserve student conversation history. **Default proposal: opt-in via `{ wipeChat: true }`.**
