# Quiz review: always explain why an answer is wrong

## What I found

- After a weekly quiz, each question card in the review list can show an AI-written explanation. Wrong answers are auto-expanded, so the box is visible.
- That explanation is generated live, at the moment of submission, by the `explain-answers` service. I tested it against realistic 10- and 12-question quizzes: it returns a correct, per-question explanation every time, including a clear "your answer was wrong because…" paragraph. The last 130 calls all succeeded.
- So the failure is not the wording of the explanation — it is that the box often has nothing in it and falls back to the grey line "Explanation not available.":
  - Nothing is stored. The explanation lives only in browser memory for that one screen. Closing the quiz, reopening the attempt from history, or refreshing loses it entirely.
  - It arrives late. Generation takes several seconds for a full quiz; if the student closes the dialog or the model returns an unparseable reply, they get the fallback line with no retry and no error.
  - Every question already has a teacher-side explanation saved with it in the question bank (all 1,959 quiz questions have one), but the review screen never uses it.

## The fix

1. **Show the saved explanation instantly.** Carry each question's stored explanation (and its answer options) through to the review screen so a real explanation appears the moment the quiz is submitted — no waiting, no network call needed.
2. **Layer the AI explanation on top.** Keep the live call, but treat it as an upgrade that replaces the saved text when it arrives. Give the AI the full list of answer options and the student's pick so it can say precisely why the chosen option is wrong.
3. **Never show a dead end.** If the AI call fails or is slow, keep the saved explanation visible. Only when neither exists, show a short "Couldn't load a detailed explanation" line with a Retry button.
4. **Persist for later review.** Save the generated explanations alongside the attempt so reopening it from history shows the same text rather than regenerating (or showing nothing).
5. Apply the same behaviour to the past-attempts review list, which shares the same gap.

## Technical notes

- `src/components/AssessmentView.tsx`: extend the standardised answer shape with `explanation` and `options`; seed `explanations` state from the question bank values at `setResults`; make `fetchExplanations` merge rather than overwrite, and add `explanationError` + retry state.
- Question sources (`WeeklyQuizDialog`, exam/diagnostic/practice callers) already select `explanation` and `options` from `assessment_questions` / `diagnostic_questions`; pass them into the `Question` objects so they reach the review.
- `supabase/functions/explain-answers/index.ts`: accept optional `options[]` per answer and include them in the prompt; request a JSON response format and keep the existing parse fallback.
- Persistence: store the returned explanations on the `assessment_results` row (a new `explanations` jsonb column) and read them in `ExamHistory.tsx` / the attempt review before calling the AI.
- No change to scoring, mastery, or proctoring.
