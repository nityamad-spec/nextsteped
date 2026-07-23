## Plan: Update weekly quiz score card with breakdown lines

### Goal
Update the "Weekly Quiz Complete" score card in `src/components/AssessmentView.tsx` so that the **Score** stat card shows three explanatory lines underneath the percentage, matching the uploaded screenshot reference.

### Current state
- The review screen renders three stat cards: **Score**, **Correct**, **Time**.
- `AssessmentResults` already carries `score`, `correctAnswers`, `totalQuestions`, and `timeSpent`.
- No data model or backend changes are required.

### Changes
1. **UI update in `src/components/AssessmentView.tsx`** (review screen, ~lines 553–566)
   - Under the `Score` stat card, add three lines in small muted text:
     - `Score accounts for question difficulty, accuracy, and time.`
     - `Correct accuracy: {correctAnswers}/{totalQuestions} correct ({pct}%)`
     - `Average pace: {avg}s/question`
   - Compute `pct` as `Math.round((correctAnswers / (totalQuestions || 1)) * 100)`.
   - Compute `avg` as `Math.round(timeSpent / (totalQuestions || 1))`.
   - Guard against division by zero with `|| 1`.

2. **Scope**
   - Apply only to `isQuiz === true` (weekly quiz), since the uploaded image and request refer to the weekly quiz completion card.
   - Leave the existing **Correct** and **Time** stat cards unchanged so the summary still displays them prominently.

### Verification
- Run TypeScript typecheck.
- If any existing tests fail, report them for approval before fixing (per `TESTING.md` / project memory rule).

### Open question
- Should the same three lines also appear on the **Exam Practice Complete** card, or is this strictly for the weekly quiz?