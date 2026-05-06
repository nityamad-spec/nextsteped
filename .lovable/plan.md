## Goal

When a teacher deletes a syllabus file in `/teacher/setup/upload`, warn them that everything generated from it (parsed syllabus JSON, concepts, lesson plan, diagnostic questions, plus dependent caches and per-course setup progress) will also be wiped. On confirm, run the cascade and show a step-by-step progress UI with an estimated time.

## UX

In `FileUploadZone.tsx`, when `folderType === "syllabus"` and the file being deleted is the last syllabus file for the course, change the existing `AlertDialog`:

- Title: "Delete syllabus and all generated content?"
- Body: lists what will be wiped (parsed syllabus JSON, extracted/confirmed concepts, lesson plan weeks, diagnostic questions, related caches, completion of downstream setup steps). Notes that uploaded "Past materials" are NOT affected.
- Confirm button label: "Delete and wipe generated data".

If there are still other syllabus files left after this delete, fall back to the current simple confirm copy (no cascade).

After confirm, replace the dialog body with a `WipeProgressPanel`:

- A list of steps, each with idle/running/done/failed icon (Loader2 / Check / X).
- A `Progress` bar (existing `@/components/ui/progress`) driven by completed-step count.
- A live "Estimated time remaining: ~Ns" counter computed from per-step weights (see Technical), counting down each second.
- Buttons disabled until all steps resolve; then a single "Close" button. Toast success/failure at the end.

Steps shown to the user (in order):
1. Removing syllabus file
2. Clearing parsed syllabus JSON
3. Deleting concepts
4. Deleting lesson plan weeks
5. Deleting diagnostic questions
6. Resetting course flags & cache
7. Resetting downstream setup progress

## Technical

### New edge function: `wipe-syllabus-cascade`

Path: `supabase/functions/wipe-syllabus-cascade/index.ts`. Standard CORS, validates JWT via `getClaims` (same pattern as `wipe-courses`), then:

1. Verify caller is course member (`is_course_member(course_id, user_id)` via service-role select on `courses` + `course_teachers`) — reject 403 otherwise.
2. Accept body `{ courseId: string, syllabusStoragePath: string }` (validated with Zod).
3. Execute steps sequentially, returning `{ ok, deleted: { ... }, durations: { stepId: ms } }`. Each step is wrapped in try/catch; on first failure, return 500 with the step id and message so the UI can mark it failed.

Step list (server-side, mirrors UI step list):
- `syllabus_file`: `storage.remove([syllabusStoragePath])` and `delete from course_material_files where storage_path = $1`.
- `syllabus_json`: `storage.remove(["{courseId}/syllabus/approved-syllabus.json"])` (ignore not-found).
- `concepts`: `delete from concepts where course_id = $1`. Also `delete from assessment_questions where course_id = $1` (they reference concept topics) — keep this scoped to teacher-owned content; out of scope for student `assessment_results` (those stay for analytics).
- `lesson_plan`: `delete from lesson_plan_weeks where course_id = $1`; also `storage.remove` of `lesson_plan_path` and `lesson_plan_draft_path` if set.
- `diagnostic_questions`: `delete from diagnostic_questions where course_id = $1`.
- `course_flags`: update `courses` set `syllabus_uploaded=false, syllabus_json_path=null, lesson_plan_path=null, lesson_plan_draft_path=null, lesson_plan_published_at=null, lesson_plan_overall_outcomes=null, published=false`. Then `bump_cache_version('course', courseId)`.
- `setup_progress`: delete rows from `teacher_setup_progress` where `course_id = $1` and `step_id in ('concept-review','lesson-plan','diagnostic','ai-assistant','exam-mode','enrollment')` (keep `upload` so the user can immediately see step 1 still completed for the file they just removed — but since we just removed it, also delete `upload`). Net: delete all rows for this course.

Out of scope (explicitly NOT touched): `enrollments`, `assessment_results`, `diagnostic_results`, `chat_*`, `student_feedback`, `course_ta_settings`, "Past Course Materials" files in `lesson-plans/` folder.

Estimated per-step weights (used both for progress bar and ETA in the UI): syllabus_file 1s, syllabus_json 1s, concepts 2s, lesson_plan 2s, diagnostic_questions 2s, course_flags 1s, setup_progress 1s. Total ~10s.

### Frontend wiring (`FileUploadZone.tsx`)

- New state: `wipeOpen`, `wipeSteps` (array of `{id,label,status,startedAt?}`), `wipeStartedAt`.
- Replace the inner body of the existing `AlertDialog` for syllabus-cascade case. Keep the simple confirm dialog for non-cascade deletes.
- `performDelete` for syllabus-with-cascade case calls `supabase.functions.invoke("wipe-syllabus-cascade", { body: { courseId, syllabusStoragePath: file.path } })`. Because the function runs sequentially server-side and returns once, the UI cannot show real-time per-step status from a single invoke. Approach: drive the UI clock locally using the per-step weights — mark steps `running`→`done` on the predicted timeline while the request is in flight; when the response returns, reconcile (any step the server marked failed flips to failed, remaining steps jump to done). This keeps the function simple (no streaming) and matches the "estimated time" framing the user asked for.
- On success: clear file from local state (same as today), clear `parseStatus`, toast success, navigate stays on the same page (downstream steps will re-lock automatically because their gating reads `concepts`/`lesson_plan_weeks`).
- On failure: toast error with which step failed; leave file list refreshed from a re-fetch so UI stays consistent.

### Files to add / edit

- ADD `supabase/functions/wipe-syllabus-cascade/index.ts`
- EDIT `src/components/FileUploadZone.tsx` (dialog copy, new progress panel component inline, new invoke path for syllabus cascade)
- No DB migration needed — all changes are deletes against existing tables.

### Memory update

Append a note to `mem://ux/teacher-setup-flow` documenting the cascade behavior so future changes to downstream steps remember to add themselves to the wipe list.
