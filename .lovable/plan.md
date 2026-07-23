Phase: UI caption redistribution on the quiz/exam completion screen

Goal
On the completion screen in `src/components/AssessmentView.tsx`, move the explanatory text so each stat card has its own caption:
- Under **Score**: "Score accounts for question difficulty, accuracy, and time."
- Under **Correct**: "Score accounts only for accuracy."
- Under **Time**: "seconds per question"

Resolved requirements from clarifying questions
- Captions are hover-revealed on desktop, always visible on mobile.
- Keep the numeric accuracy fraction and average-pace lines, but place them under the **Correct** and **Time** cards respectively.
- Switch the **Time** card’s big number from total elapsed time to average seconds per question.
- Apply the same three-card caption layout to both weekly quiz and exam practice completion screens, with a mode-appropriate Score caption (exam score does not include time, so it will read "Score accounts for question difficulty and accuracy.").

Implementation steps
1. Update the completion screen JSX in `src/components/AssessmentView.tsx`.
   - Remove the current three-line block that sits under the **Score** card.
   - Wrap each stat card (or its value block) in a `group` container so hover can reveal the caption/details block.
   - **Score card**: show the composite-score caption on hover / on mobile.
   - **Correct card**: on hover / mobile, show the caption "Score accounts only for accuracy." and the existing accuracy fraction line (`{correct}/{total} correct ({pct}%)`).
   - **Time card**: change the big number from `formatTime(total)` to `Math.round(results.timeSpent / (results.totalQuestions || 1))s`. On hover / mobile, show the caption "seconds per question" and the existing average-pace line (which will now match the big number).
   - Use the existing `isQuiz` flag to decide caption wording, but show the layout for both quiz and exam modes.
2. Preserve accessibility.
   - Ensure the hover-only content is still reachable on touch devices by using the `group-hover` + `block` on mobile breakpoint pattern already used elsewhere, or by making the captions always visible below `sm:` breakpoint.
3. Verify no consumers break.
   - `AssessmentResults` already exposes `accuracyScore`, `paceScore`, `timeSpent`, `totalQuestions`, and `correctAnswers`; no type changes are needed.
   - `formatTime` may become unused for the Time card but is still used elsewhere; do not remove it.
4. Run checks.
   - TypeScript typecheck.
   - `WeeklyQuizDialog.test.tsx` and any exam-mode tests that assert the completion screen text.
   - Report any failures without auto-fixing per project rule.

Files changed
- `src/components/AssessmentView.tsx`

No database or backend changes are required.