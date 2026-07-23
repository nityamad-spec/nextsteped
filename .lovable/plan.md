Plan: Show weekly quiz scoring breakdown on Student Home

Goal
On /student/home, inside each unit's weekly-quiz card, show a short explanation of how the displayed score is calculated and surface the accuracy-only score plus average time per question.

Current state
- `StudentHome.tsx` loads `assessment_results` for the enrolled course and stores `takenQuizzes` as `Record<number, { score: number }>`.
- The unit card renders: `Completed — ${taken.score}%` when a quiz has been taken.
- `assessment_results` already stores `correct_answers`, `total_questions`, and `time_spent`, so no backend/schema changes are needed.

Changes

1. Extend quiz-result fetch
   - In the `assessment_results` query inside `StudentHome.tsx`, also select `correct_answers`, `total_questions`, and `time_spent`.
   - Update `takenQuizzes` state to `Record<number, { score: number; correctAnswers: number; totalQuestions: number; timeSpent: number }>`.
   - Keep the existing "highest score wins" merge logic, but now merge all four fields from the row with the highest score.

2. Add display helpers
   - `formatAvgTime(seconds, totalQuestions)` → returns a compact string like `"45s/question"`, with safe handling for zero questions.
   - `accuracyPct(correct, total)` → returns the integer percentage used in the breakdown.

3. Update the unit-card quiz row UI
   - Keep the existing `Completed — ${score}%` line.
   - Directly underneath it, render three small muted lines:
     - `"Score accounts for question difficulty, accuracy, and time."`
     - `"${correctAnswers}/${totalQuestions} correct (${accuracyPct}%)"`
     - `"${avgTime}s/question"`
   - Use the existing `text-xs text-muted-foreground` style so the breakdown is subordinate to the main score.
   - Hide the new lines when the quiz has not been taken (unchanged behavior).

4. Verify no regressions
   - `passedQuizCount` and `progressPct` still rely on `score > 50`; no logic change is required.
   - Any other consumers of `takenQuizzes` only read `.score`; the type change is backward-compatible in runtime.
   - Run typecheck and the existing `StudentHome.test.tsx` suite; report failures rather than auto-fixing per project memory.

Files touched
- `src/pages/student/StudentHome.tsx` (fetch, state, UI)

Out of scope
- No changes to the scoring math itself (already implemented in `masteryScoring.ts` / `AssessmentView.tsx`).
- No changes to the Course Progress top-line summary.
- No new backend migrations or edge functions.

Risks / constraints
- Historical rows that pre-date `correct_answers`/`time_spent` may have zeros; the helper should guard against division by zero and display `"—"` for missing time.
- The UI should remain compact inside the unit card so the lesson-plan accordion does not become unwieldy.

Estimated size: small, single-file frontend change.