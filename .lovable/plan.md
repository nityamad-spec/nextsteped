## Goal
On the weekly quiz (`AssessmentView` in `mode="quiz"`), prevent students from navigating back to previously-answered questions.

## Approach
In `src/components/AssessmentView.tsx`, make weekly quiz navigation one-way. Track the highest index the student has advanced past once an answer is recorded, and lock the Previous button so they cannot return to any question they have already answered.

Behavior:
- If the current question has been answered, clicking Next locks it (adds its index to a `lockedIndices` set).
- The Previous button is disabled whenever `safeIndex - 1` is in `lockedIndices` (i.e., the prior question was already answered and moved past).
- Exam Practice mode (`isQuiz === false`) is unchanged — it renders all questions on one page anyway.

## Changes
- `src/components/AssessmentView.tsx`
  - Add `const [lockedIndices, setLockedIndices] = useState<Set<number>>(new Set())`.
  - In the Next button handler (~line 609): if `answers[questions[safeIndex].id]` is set, add `safeIndex` to `lockedIndices` before advancing.
  - Previous button (~line 585): `disabled={safeIndex === 0 || lockedIndices.has(safeIndex - 1)}`.

Alternative (simpler) if you'd prefer: just hide/disable the Previous button entirely for weekly quizzes — no per-question tracking. Let me know which you want.

## Out of scope
- No DB/schema changes.
- No changes to exam practice, AI-chat quiz launch flow, or scoring.
- No new tests (existing `WeeklyQuizDialog.test.tsx` still passes).