# Reset Study and Practice after a low quiz score

## Goal

On `/student/learning-path`, when a unit's quiz is done but readiness is below 75% (stage `needs_work`), the Study and Practice steps should show as **incomplete** again, so the student has a clear fresh pair of actions. They re-complete once the student studies or practises **again, after the quiz attempt**.

## How completion is decided after a quiz

Today `studied` / `practised` count any qualifying activity ever. The change makes them time-aware for units whose quiz is done:

- Load the quiz attempt time per unit (`assessment_results.created_at` for `mode = daily_quiz`, latest attempt).
- For a unit with a completed quiz, only activity **after** that timestamp counts:
  - Study: a study-mode chat session attributed to the unit with 2+ user messages whose latest user message is after the quiz time.
  - Practice: a practice `assessment_results` row for that unit created after the quiz time.
- Units with no quiz attempt behave exactly as today.

This means immediately after a low-scoring quiz both steps read incomplete, and each ticks again as the student redoes it.

## Technical changes

- `src/hooks/useUnitProgress.ts`
  - Select `created_at` alongside existing fields for chat messages and practice results.
  - Accept a new argument `quizTakenAtByUnit: Record<number, string | undefined>`.
  - When a unit has a quiz timestamp, filter its study/practice evidence to rows newer than it. The mastery-based "studied" signal is not used for such units (mastery is written by the quiz itself, so it would falsely re-complete Study).
- `src/pages/student/StudentLearningPath.tsx` — keep the max-score row for display, but also track each unit's latest `created_at`, and pass the map into `useUnitProgress`.
- `src/pages/student/StudentHome.tsx` — pass the same map so Home's "What to do today" stays in sync with the Learning Path.
- `src/components/student/UnitPathwayCard.tsx` — no change; it already renders `done` from the props.

## Risks

- Deleting chat history or a re-scored quiz can shift these signals; progress stays inferred, as today.
- The needs_work banner copy is unchanged — it already tells the student to study and practise again.
