# Coding/lab week as a lesson-plan week type

Add "Coding/lab week" as a fourth week type alongside Teaching / Midterm / Final on `/teacher/setup/lesson-plan`, available only for courses with admin-approved coding access (`courses.coding_access_status = 'approved'`). A course can mix teaching and coding weeks freely; a coding-only course can use only coding weeks. The same concept can be mapped once to a teaching week (theory) and again to a coding week (implementation) via an explicit duplicate action — no duplicate concept records.

Resolved decisions: generator stays manual-only (no `generate-lesson-plan` changes); coding weeks have **no weekly quiz**; dual mapping uses an **explicit "Duplicate to coding week" action**.

## Phase 1 — Database

- Add `is_coding_week boolean not null default false` to `lesson_plan_weeks`.
- Add a CHECK constraint enforcing mutual exclusivity: a week cannot be both an exam week and a coding week.
- No new table, so no GRANT/RLS changes — existing `lesson_plan_weeks` policies already cover teachers and enrolled students. Existing rows default to `false` (no backfill needed).
- Types regenerate after approval.

## Phase 2 — Teacher lesson-plan editor (`CourseCreation.tsx`)

- `WeekPlan` type gains `is_coding_week: boolean`; carried through draft save/load, publish mappings, and `addWeek` (default `false`).
- Week-type dropdown gains **"Coding/lab week"**, shown only when `useCodingAccess(courseId).isApproved`. If access is later revoked while coding weeks exist, the option stays selectable for those weeks (mirrors the existing coding-exercise resource pattern) so the plan remains editable.
- Generalize `setWeekExamMode` into a `setWeekType` handler: selecting coding sets `is_coding_week=true, is_exam_week=false, exam_type=null`; selecting teaching/exam clears `is_coding_week`.
- Coding weeks get a distinct badge in the week header (Code2 icon, "Coding/lab"), analogous to the exam badge.
- Concept drag-and-drop: coding weeks **accept** drops (not disabled like exam weeks). Moving between two teaching weeks keeps today's move semantics.
- **Duplicate action:** each concept card's menu gains "Duplicate to coding week →" listing the plan's coding weeks. It copies the concept object (same `id`, name, description) into the target week without removing it from the source — concept mastery stays keyed to the single concept id. Hidden when no coding weeks exist.
- Regenerate-week button stays enabled for coding weeks (regenerates title/overview/resources only).

## Phase 3 — Publish & sync (`src/lib/lessonPlanWeeks.ts`)

- `WeekUpsertInput`, `upsertPublishedWeeks`, and `fetchVisibleWeeks` carry `is_coding_week`.
- Preserve `is_coding_week` by week_number across clean-slate republish (same pattern already used for `quiz_type_counts`), so an AI "Update Plan" regeneration doesn't wipe manual coding-week designations.

## Phase 4 — Quiz exclusion

- `generate-weekly-quiz` edge function: return a clear 400 ("Coding/lab weeks don't have quizzes") when the target week is a coding week — covers every caller (student dialog, learning path, teacher preview).
- Teacher quiz preview trigger in `CourseCreation.tsx` (streams from `generate-weekly-quiz`): hidden/disabled for coding weeks.

## Phase 5 — Student experience

- `useLearningPlan.ts`: select and expose `is_coding_week` on `LearningPlanWeek`.
- `StudentLearningPath.tsx` / `UnitPathwayCard.tsx`: coding units show a "Coding/lab" badge; the Quiz step is hidden so the pathway is Study → Practice (+ the coding-exercise resource card). Readiness keeps working unchanged — `useUnitReadiness` is mastery-based and practice questions raise mastery without a quiz.
- `StudentHome.tsx` "What to do today": never surfaces a "Start Quiz" CTA for a coding unit.
- Coding-exercise resource filtering by `useCodingAccess` already in place; coding weeks themselves remain visible if access is revoked (badge only, exercise hidden).

## Tests

- Unit: `setWeekType` transitions and mutual exclusivity; duplicate action copies concept without removing from source; `upsertPublishedWeeks` round-trips and preserves `is_coding_week`.
- Component: coding week option hidden when access not approved; Quiz step absent for coding units; "What to do today" shows no quiz CTA for coding units.
- Edge-function guard covered via existing quiz-generation test patterns where feasible.

## Risks / constraints

- **Regeneration wipes designations** unless Phase 3's preservation lands — the plan's "Update Plan" replaces all weeks, so preserving `is_coding_week` by week number is required, not optional.
- **Dual-mapped concepts**: the same concept id appears in two weeks' JSON. Mastery, quizzes, and analytics are all keyed by concept id/name, so no duplicate concept record is created; concept-coverage views may show the concept in two weeks (by design — theory vs implementation).
- **Mutual exclusivity** with exam weeks is enforced in both the UI setter and a DB CHECK constraint.
- **Access revocation**: plan keeps rendering coding weeks so teachers don't lose content; students see the week but not the coding exercise.
- **Legacy surfaces**: `TeachingPlan.tsx` / `normalizeLessonPlan` are legacy-only and won't know about coding weeks — they render as ordinary weeks there (accepted limitation).
- **Deferred (out of scope, per decisions):** AI generator auto-designating coding weeks, Judge0 execution, coding-specific mastery scoring.
