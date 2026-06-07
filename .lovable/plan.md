# Why quizzes appear for unpublished weeks

`WeeklyQuizDialog.tsx` queries `assessment_questions` for `mode='daily_quiz'` + `quiz_day=N`. When that returns 0 rows (as for Statistics weeks 2/3/4/13), it falls back to a **hardcoded Python question bank** (`src/data/questionBank.ts` via `getQuizQuestions(day, numQuestions)`).

So the student always sees a quiz — either the real one or generic Python questions — regardless of what the professor published. For a Statistics course this is doubly wrong (wrong subject + unpublished).

`StudentHome.tsx` makes it worse: it shows a "Take Quiz" button for every week in the lesson plan without checking whether questions exist.

# Fix

1. `**src/components/WeeklyQuizDialog.tsx**`
  - Remove the `getQuizQuestions(...)` fallback. If the DB query returns 0 rows, show an empty state ("No quiz available for this week yet") and disable submission. No static questions, ever.
  - Drop the `import { getQuizQuestions, Question } from "@/data/questionBank"` (keep the `Question` type by importing only the type, or inline it).
2. `**src/pages/student/StudentHome.tsx**`
  - Add a lightweight query alongside the existing `takenQuizzes` load that fetches the set of `quiz_day` values present in `assessment_questions` for the enrolled course + `mode='daily_quiz'`. Store as `availableQuizDays: Set<number>`.
  - In the weekly card render (around line 459–490), only render the "Take Quiz" row when `availableQuizDays.has(dp.day)`. Otherwise show nothing (or a muted "Quiz not yet available" line — confirm preference below).
3. `**src/data/questionBank.ts**` — leave the file in place for now (other tests reference it). It just stops being called from the dialog. We can delete it in a follow-up once we confirm no other runtime path imports it.

# Out of scope

- No changes to scoring, mastery, or the professor publish flow.
- No DB/migration changes.

# Risks

- `WeeklyQuizDialog.test.tsx` may rely on the fallback — will update the test to mock `assessment_questions` rows instead.
- Any existing student who previously "completed" a fallback quiz still has a row in `assessment_results`; they'll keep their "Quiz completed" badge but no new fallback attempts can happen.

# Question before implementing

For weeks where the professor hasn't published a quiz, the weekly card should show a muted "Quiz not yet available" line?