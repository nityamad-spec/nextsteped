## Fill quiz dot on completion (any score)

In `src/pages/student/StudentHome.tsx` (Lesson Plan collapsed row, ~lines 645–680), change the quiz-dot rule:

- Replace `quizPassed` gating for the dot with `quizTakenAny = !!takenQuizzes[dp.day]`.
- Quiz dot renders filled (`bg-primary`, or `bg-emerald-500` when Unit is COMPLETE and it's the last dot) whenever the quiz has been taken, regardless of score.
- `doneCount` also counts the quiz once it's been taken.
- Unit `isComplete` rule stays the same: all activities done AND quiz taken with score > 50 (passing still required for the green COMPLETE badge + green avatar).

Frontend only, no DB changes.
