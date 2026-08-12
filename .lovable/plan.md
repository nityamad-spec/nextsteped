# Concept-Level Quizzes (replacing weekly quizzes)

## Goal
Every concept gets its own quiz. Weeks become a grouping layer only: professors group concepts into weeks in the lesson plan, and students work through one Study → Practice → Quiz pathway per concept.

## Decisions locked in
- Full replacement — weekly quizzes retire; concept quizzes are the only quiz track.
- Week grouping reuses the existing lesson plan weeks (drag concepts between weeks there).
- Learning Path unit = one concept.
- Readiness is per concept, rolled up to week and course progress.

## Phase 1 — Data model
- `assessment_questions`: add `concept_quiz` as the quiz mode and rely on the existing `concept_id` column to identify which quiz an item belongs to. `quiz_day` stays populated (the concept's week) purely for grouping/analytics.
- `assessment_results`: add a nullable `concept_id` column so an attempt is attributable to a concept, keeping `quiz_day` for the week roll-up.
- `assessment_attempt_voids`: allow `assessment_type = 'concept_quiz'` with the concept id as `ref_key`.
- Per-concept quiz config (question count, format mix, enabled/disabled) moves from `lesson_plan_weeks.quiz_type_counts` to a per-concept store; week-level values become the default that seeds each concept.
- Existing weekly quiz questions and results are left in place as historical records under their old mode; nothing is deleted.

## Phase 2 — Generation
- Rework `generate-weekly-quiz` into a concept-scoped generator: input `{ courseId, conceptId }`, prompt limited to that one concept, tiers and format-mix quotas unchanged. Because a call covers one concept instead of a whole week, each run is smaller and faster.
- Add a "generate all quizzes for this week" action that fans out over the week's concepts sequentially, streaming per-concept progress the way the current NDJSON stream does.

## Phase 3 — Teacher UI
- Lesson plan step: inside each week, every concept card gains its own quiz row — status (not generated / N questions), format mix control, and Generate/Regenerate. The week header keeps a summary ("4 of 5 concept quizzes ready") plus the fan-out button.
- Concepts continue to be dragged between weeks; moving a concept moves its quiz with it, no regeneration required.
- Assessments and Assessment Analytics pages switch their quiz grouping from week to concept, with week as a collapsible grouping header.

## Phase 4 — Student UI
- Learning Path: one `UnitPathwayCard` per concept, listed under a week heading. Each card keeps the three steps — Study (chat on the concept), Practice, Quiz (that concept's quiz).
- `WeeklyQuizDialog` becomes a concept quiz dialog keyed by concept id; proctoring, reasoning capture and short-answer grading behave exactly as today.
- Home "What to do today" focuses on the first non-ready concept and uses the same Study / Practice / Quiz tags.

## Phase 5 — Readiness and progress
- Concept readiness = that concept's mastery score (already produced by `update-mastery`), threshold unchanged at 75%.
- Week readiness = weight-weighted average of its concepts; course progress = concepts at or above threshold out of total concepts.
- `useUnitReadiness` and `useUnitProgress` are re-keyed from week number to concept id, with a week roll-up computed on top.

## Phase 6 — Verification
- Typecheck, run the existing quiz/proctoring/readiness tests, and update the ones keyed to `quiz_day`.
- Manual pass: generate a concept quiz as a professor, take it as a student, confirm mastery, readiness and progress all update.

## Risks and constraints
- Volume: a 16-week course with 4 concepts a week means ~64 quizzes instead of 16. Generation cost and professor review effort rise sharply — the week-level fan-out button and per-concept format defaults exist to keep that manageable.
- Many surfaces read `quiz_day` (achievements, three Excel exports, teaching insights, chat, admin dialogs). They keep working via the retained `quiz_day` value, but each needs a pass to relabel and to handle concept-level rows.
- Historical weekly results and concept results coexist, so analytics must handle both shapes for the rest of the current term.
- Concepts are matched by name between `lesson_plan_weeks.concepts` and the `concepts` table today; concept-keyed quizzes make that fragile, so this plan switches the join to concept ids and backfills the link where names currently match.
