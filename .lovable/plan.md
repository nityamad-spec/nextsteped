# Why the student sees 7 exams but the professor shows 4

The two screens count exams from different sources.

- **Professor (`/teacher/setup/exam-mode`)** renders `taSettings.examSchedule` — the canonical list saved in `course_ta_settings.exam_schedule` (4 entries for this course).
- **Student (`/student/chat` → exam prep)** runs `loadAvailableExamIds` in `src/pages/student/AIChat.tsx` (≈L437–460), which counts **DISTINCT `exam_id`** in `assessment_questions` where `mode='exam'`. It never cross-checks the schedule.

DB confirms the leak on the "Generative AI Leader" course: 7 distinct `exam_id`s in `assessment_questions`, but only 4 in `exam_schedule`. The 3 extras are AI-generated rows (`item_code` like `exam-<uuid>-N`) tied to exams the professor previously had in the schedule.

## Root cause of the orphans

`handleRemoveExamRequest` / `confirmRemoveExam` in `src/pages/teacher/ExamMode.tsx` (≈L270–282) shrink `examSchedule` with `prev.slice(0, -1)` and rely on the autosave to persist the new schedule. Unlike `executeDeleteExam` (≈L292–334), they do **not** delete the AI-generated `assessment_questions` rows or null out manual rows. Every time a professor removed the last card after questions were generated, that exam's rows were stranded — and the student rotation picks them up.

## Fix

Two complementary changes, plus an optional one-off cleanup.

### 1. Student side — reconcile against the schedule (primary fix)

In `src/pages/student/AIChat.tsx`, change `loadAvailableExamIds` so the rotation only includes `exam_id`s that exist in the current `taSettings.examSchedule`.

- After fetching distinct `exam_id`s from `assessment_questions`, intersect them with `new Set(taSettings.examSchedule?.map(e => e.id))`.
- If `taSettings.examSchedule` is empty/unloaded, fall back to current behaviour to avoid blanking the panel during load.
- `examCount` passed to `ExamPrepPanel` then matches the professor's count.

### 2. Teacher side — make "remove last exam" clean up like delete

In `src/pages/teacher/ExamMode.tsx`, refactor `confirmRemoveExam` (and the unapproved branch of `handleRemoveExamRequest`) to run the same cleanup as `executeDeleteExam` for the removed `exam_id`:

- Delete `assessment_questions` rows where `item_code LIKE 'exam-%'` and `exam_id = removed.id`.
- `UPDATE assessment_questions SET exam_id = NULL` for any remaining manual rows with that `exam_id`.
- `bumpCacheVersion("questions", courseId)` so caches refresh.

This keeps the schedule and the question table in sync going forward.

### 3. One-off cleanup of existing orphans (optional, recommended)

For courses where `assessment_questions.exam_id` is not present in `course_ta_settings.exam_schedule`:

- Delete the AI-generated rows (`item_code LIKE 'exam-%'`).
- Null out `exam_id` on any manual rows.

This can be done as a one-shot SQL migration scoped to currently affected courses (3 orphan ids on GAIL, 0 on the others).

## Risks

- **Student fix depends on TA settings loading first.** If `taSettings.examSchedule` is still null when the panel renders, the count could briefly read 0. Mitigation: fall back to the unfiltered list while `taSettings` is loading, and recompute when it resolves.
- **Schedule entries with no generated questions yet** will show up as exams on the professor side but produce 0 on the student side. The student rotation already skips ids with no questions, so the visible "exam count" could drop below the schedule length until questions are generated. Acceptable, and matches reality.
- **Teacher "remove last" becomes destructive.** It will now permanently delete AI-generated questions and unlink manual ones, same as the explicit delete flow. We should keep the existing confirmation dialog for the approved case and add one for the unapproved-but-has-questions case to avoid surprise data loss.
- **One-off cleanup is irreversible.** Run it inside a transaction, log affected ids, and only target rows whose `exam_id` is not in the course's current `exam_schedule`. Manual rows are preserved (only their `exam_id` is nulled).
- **Concurrent edits.** If a second teacher is editing the schedule during cleanup, a freshly-added exam id might briefly look like an orphan. Mitigation: cleanup keys off `course_ta_settings.exam_schedule` read at execution time, scoped per course.

## Files touched

- `src/pages/student/AIChat.tsx` — `loadAvailableExamIds` reconciliation.
- `src/pages/teacher/ExamMode.tsx` — cleanup in remove-last-exam path.
- Optional SQL migration under `supabase/migrations/` for the one-off orphan purge.
