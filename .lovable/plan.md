## Plan

Switch the weekly quiz (`/student/home` → WeeklyQuizDialog) from rendering all questions at once to one-question-per-page with Next/Previous navigation. Scope the change to `type="quiz"` only — exam simulation (`type="exam"`) keeps its current all-at-once layout.

### Change in `src/components/AssessmentView.tsx`

Active phase render (currently lines ~456–502):

- Add `const [currentIndex, setCurrentIndex] = useState(0)` (reset when phase enters "active").
- When `isQuiz`:
  - Render only `renderQuestionCard(questions[currentIndex], currentIndex)` instead of mapping all questions.
  - Add a step indicator in the header: `Question {currentIndex+1} of {questions.length}` (replacing or alongside the existing "answered" count).
  - Below the question card, add a footer row with:
    - **Previous** button (`variant="outline"`), disabled when `currentIndex === 0`.
    - **Next** button, shown when `currentIndex < questions.length - 1`, advances `currentIndex`. Not gated on the current question being answered (students can skip and come back).
    - **Submit Quiz** button, shown only on the last question (`currentIndex === questions.length - 1`), keeps existing `handleFinish` behavior and `disabled={answeredCount === 0}` rule.
  - Progress bar value uses `(currentIndex + 1) / questions.length` for quiz, so it reflects page position; keep the answered count visible as secondary text.
- When `!isQuiz` (exam): keep existing `questions.map(...)` + bottom Submit unchanged.

No changes to scoring, submission payload, mastery updates, question ordering (seededShuffle stays), or `WeeklyQuizDialog`. Pure UI/navigation change in the active phase.

### Out of scope
- Exam mode pagination.
- Per-question validation gating (skip allowed).
- Test updates beyond what's needed to keep existing WeeklyQuizDialog tests green (they stub AssessmentView, so unaffected).
