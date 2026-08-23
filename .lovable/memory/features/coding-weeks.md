---
name: Coding/Lab Weeks
description: Lesson-plan week type alongside teaching/exam weeks — quiz-exempt, admin-gated by coding access, dual concept mapping via duplicate action
type: feature
---

Coding/lab weeks are a third lesson-plan week type (`lesson_plan_weeks.is_coding_week`, mutually exclusive with `is_exam_week` via DB CHECK constraint).

- **Gating**: the "Coding/lab" option in the week-type Select only appears when `useCodingAccess().isApproved` (admin-approved per course). Coding weeks are MANUAL-only — `generate-lesson-plan` is unchanged and never generates them.
- **No quizzes**: coding weeks are assessed via the coding exercise, not a weekly quiz. `generate-weekly-quiz` returns 400 for coding weeks; `CourseCreation.tsx` hides the Weekly Quiz section and `handleGenerateWeeklyQuiz` refuses them; `UnitPathwayCard` hides the quiz StepCard; `StudentHome` never offers a quiz CTA for coding units.
- **Progression**: `computeUnitStage` in `src/lib/unitStage.ts` takes `quizExempt` — coding units reach "ready" when readiness ≥ 75 from study + practice alone (requires studied or practised so diagnostic-seeded mastery doesn't auto-complete).
- **Dual mapping**: the same concept can appear in a teaching week (theory) and a coding week (implementation). UI: copy (Copy icon) dropdown on concept cards duplicates a concept into a coding week without removing it from the source (`duplicateConceptToWeek` in CourseCreation.tsx); the copy gets a fresh local id but stays the same underlying concept (downstream keys off name). Duplicate-in-place within a coding week is blocked by name match.
- **Persistence**: `upsertPublishedWeeks` in `src/lib/lessonPlanWeeks.ts` preserves `is_coding_week` (and `quiz_type_counts`) across clean-slate republishes, so legacy `TeachingPlan.tsx` publishes don't clobber the flag.
- **Student UI**: `UnitPathwayCard` shows a "Coding/lab" badge (Code2 icon) and its next-move copy points at the coding exercise instead of a quiz.
- **Deferred**: Judge0 execution and coding-exercise scoring are still not built (see coding-access memory).
