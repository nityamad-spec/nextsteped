# Fix: `completed_at` never set for auto-detected complete steps

## Problem

`teacher_setup_progress.completed_at` stays `NULL` for steps that the Course Setup UI shows as **Complete**. The UI derives completion from other tables (e.g. `courses.syllabus_json_path`, `concepts`, `courses.lesson_plan_published_at`, `diagnostic_questions`, `course_ta_settings`), but nothing writes that derived "done" state back to `teacher_setup_progress`. Confirmed via DB: rows for the active course have `completed_at = NULL` even though their steps render as Complete.

Only `enrollment` and `ai-settings` rely on the explicit `markStepCompleted` flag today; every other step is computed on the fly and never persisted.

## Fix

Persist completion the moment `CourseSetup.tsx` decides a step is Complete. This both backfills existing rows and keeps the column accurate going forward — no migration needed.

### Change in `src/pages/teacher/CourseSetup.tsx`

Inside the `fetchStatuses` effect, after the `next` map is fully built (and after the prerequisite-chain enforcement block), iterate over the auto-derived steps and persist completion for any that are now Complete but were not previously marked completed in `teacher_setup_progress`:

```ts
const AUTO_COMPLETE_STEPS = [
  "upload",
  "concept-review",
  "lesson-plan",
  "diagnostic",
  "exam-mode",
  // ai-settings & enrollment are already handled via explicit markStepCompleted
];

if (user && courseId) {
  for (const stepId of AUTO_COMPLETE_STEPS) {
    if (next[stepId] === "Complete" && !completed[stepId]) {
      void markStepCompleted(user.id, stepId, courseId);
    }
  }
}
```

`markStepCompleted` already upserts on `(teacher_id, course_id, step_id)` and stamps `completed_at = now()`, so existing rows get backfilled on the next visit to `/teacher/setup` and new ones are created if missing. Fire-and-forget is fine — UI state is already correct from the derived check.

### Why not a SQL backfill migration

The truth lives in many tables and depends on per-course logic (e.g. `lesson_plan_published_at` OR `lesson_plan_path` non-empty, syllabus path non-empty, ≥1 row in `concepts`/`diagnostic_questions`, TA settings flags). Replicating all of that in SQL is brittle; running the same derivation through the existing TS code on first load is simpler and self-healing. Each professor's rows get fixed automatically the next time they open Course Setup.

## Out of scope

- No schema changes.
- No edits to individual step pages — they already update the underlying source-of-truth tables; `CourseSetup` will reconcile `completed_at` on next visit.
- `ai-settings` and `enrollment` keep their existing explicit completion paths.
