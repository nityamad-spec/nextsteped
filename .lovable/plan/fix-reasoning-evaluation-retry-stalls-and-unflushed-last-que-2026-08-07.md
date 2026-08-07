# Fix reasoning-evaluation retry stalls and unflushed last-question rationales

Two defects in `src/hooks/useReasoningAnswers.ts` and its callers.

## 1. Retry backoff blocks submission

The retry path does `await new Promise(r => setTimeout(r, 600))` — fixed, un-jittered,
and unaware of submission. If a student hits Submit during that sleep, `waitForPending`
sits on a promise that is doing nothing for up to 600 ms before the retry even starts,
and can burn most of the 8 s deadline.

Changes:

- Replace the fixed sleep with a jittered backoff: base 400 ms plus random 0-400 ms.
- Make the sleep interruptible. Keep a `flushRef` holding a "wake now" broadcast: a set
  of resolver callbacks plus a boolean. The sleep races its timer against a promise that
  resolves when a flush is signalled, and always clears its timer on resolve.
- `waitForPending` signals the flush before awaiting, so any in-progress backoff wakes
  immediately and the retry attempt fires at once instead of idling.
- If a flush is already signalled when a retry is about to sleep, skip the sleep entirely.
- Clear the flush flag in `reset()` so a subsequent attempt gets normal backoff.

## 2. Rationales never "Next"-ed are persisted without a verdict

`waitForPending` only awaits evaluations already in flight. `AssessmentView` already
force-evaluates every Bloom 3+ question before submitting, but `DiagnosticQuiz` and
`PracticeQuestionsWidget` do not — the last question's rationale is typed, submitted, and
saved with a null verdict.

Changes:

- Add `flushAndWait(inputs: ReasoningEvalInput[], deadlineMs: number)` to the hook: it
  calls `evaluate` for each supplied input (existing de-duplication means already-done
  evaluations are no-ops), then delegates to `waitForPending`.
- `src/pages/student/DiagnosticQuiz.tsx`: at submit, build inputs from `finalQuestions`
  (id, text, options, correct answer, selected answer, topic, `bloomLevel`, course id)
  and call `flushAndWait` in place of `waitForPending`.
- `src/components/PracticeQuestionsWidget.tsx`: same at the final `handleNext`, built
  from `questions` and `answers`.
- `src/components/AssessmentView.tsx`: replace its manual `questions.forEach(evaluate)` +
  `waitForPending` pair with the single `flushAndWait` call so all three surfaces share
  one path. `waitForPending` stays exported for existing callers/tests.

## 3. StudentHome tests

`src/pages/student/StudentHome.test.tsx` fails 3 tests because `useAchievements` uses
React Query but the test renders without a `QueryClientProvider`. Wrap the render helper
in a fresh `QueryClient` provider (retries off) in that test file. Test-only change.

## Technical notes

Files touched: `src/hooks/useReasoningAnswers.ts`, `src/components/AssessmentView.tsx`,
`src/components/PracticeQuestionsWidget.tsx`, `src/pages/student/DiagnosticQuiz.tsx`,
`src/pages/student/StudentHome.test.tsx`, plus new cases in
`src/hooks/useReasoningAnswers.test.tsx` covering jittered/interruptible backoff (fake
timers), flush-wakes-retry, and `flushAndWait` evaluating a never-advanced last question.
No database, edge function, or UI changes.
