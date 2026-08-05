# Remove Midterm/Final Week inputs from the Lesson Plan step

Replace the two schedule dropdowns with a per-week "Exam week" toggle on the week cards. Existing saved midterm/final values stay in the database untouched.

## What changes on /teacher/setup/lesson-plan

1. **Schedule card (both empty-state and plan-state)**: remove the "Midterm Week" and "Final Week" selects. Remaining required fields: Total Weeks, Classes per Week, Duration per Class. Update the helper text and the schedule summary line (drop "· Midterm Wk N · Final Wk N").
2. **Gating**: `scheduleComplete` requires only the three remaining fields. The "Update Plan" change-detection snapshot drops `midterm_week` / `final_week` (keeps total weeks + cadence).
3. **New per-week control**: on each week card, a small "Exam week" toggle (and, when on, a Midterm / Final / Other selector). Flipping it sets `is_exam_week` + `exam_type` locally, clears that week's concepts/resources display state, and disables the per-week Regenerate button as today. Saved through the existing draft + publish paths (`lesson_plan_weeks.is_exam_week` already exists; `exam_type` continues to be derived/persisted the same way it is now).
4. **Generation**: `generate-lesson-plan` is called without midterm/final; it treats all weeks as teaching weeks. Marking a week as an exam week afterwards is a manual, post-generation edit.

## Where these two inputs are used elsewhere

- `src/pages/teacher/CourseCreation.tsx` — the only place they are entered/edited (both the empty-state schedule form and the plan-state schedule card), plus the clamping logic when Total Weeks shrinks, and the `exam_type` derivation when loading published weeks.
- `courses.midterm_week` / `courses.final_week` columns (migration `20260418042614_...sql`) — written only from this page.
- `supabase/functions/generate-lesson-plan/index.ts` — reads both columns to build `examWeeks`, exclude them from the allocator, label them "Midterm Exam"/"Final Exam", and reduce `teachingWeeksCount`.
- `supabase/functions/regenerate-lesson-plan-week/index.ts` — reads both to decide the exam label when regenerating a single exam week.
- Downstream consumers read only `lesson_plan_weeks.is_exam_week`, not the course columns: `src/hooks/useLearningPlan.ts`, `src/pages/teacher/TeachingPlan.tsx`, `src/pages/student/StudentLearningPath.tsx` (via the hook), and `supabase/functions/ingest-rag-document/index.ts` (RAG week summaries).
- Not affected: the Exam Mode step (`src/pages/teacher/ExamMode.tsx`) has its own midterm/final exam schedule in `course_ta_settings` and never reads `courses.midterm_week`.

## Risks and constraints

- **Teaching-week count shifts.** With no exam weeks at generation time, the allocator spreads concepts across all N weeks instead of N-2, so newly generated plans will look less dense per week than before. Expected, but worth calling out.
- **Manual toggle happens after generation.** If a professor marks week 8 as an exam week, the AI-authored content for week 8 is still there; we keep it in the draft but hide/grey it, or clear it on toggle. Recommend keeping the content and just badging the week, to avoid destructive edits — confirm at build time if you'd rather clear it.
- **Stale column data.** `midterm_week` / `final_week` remain populated for existing courses. Since the edge functions still read them, generation for an old course would still carve out exam weeks unless we also stop passing/reading them. The plan stops the edge functions from consulting the columns so behaviour is consistent for old and new courses; the columns stay in the schema, unused.
- **`exam_type` provenance.** Today it's derived by comparing `week_number` to the course columns on load. Once the toggle is manual, `exam_type` must be persisted per week. `lesson_plan_weeks` has no `exam_type` column — options: add one, or store it inside the existing `concepts`/metadata JSON. Adding a nullable `exam_type text` column to `lesson_plan_weeks` is the cleaner route and is part of this change.
- **Published-plan round-trip.** Any week toggled to exam must survive publish → reload. That flows through `upsertPublishedWeeks` in `src/lib/lessonPlanWeeks.ts`, which needs the new field added to its insert payload.
- No student-facing behaviour changes beyond which weeks show the exam badge.

## Technical touch points

- `src/pages/teacher/CourseCreation.tsx` (UI removal, gating, snapshot, per-week toggle)
- `src/lib/lessonPlanWeeks.ts` (`exam_type` in the upsert payload)
- Migration: `ALTER TABLE public.lesson_plan_weeks ADD COLUMN IF NOT EXISTS exam_type text`
- `supabase/functions/generate-lesson-plan/index.ts` (stop reading/using midterm/final)
- `supabase/functions/regenerate-lesson-plan-week/index.ts` (use the week's own `exam_type`)
