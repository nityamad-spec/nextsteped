

## Finding: Exam & Quiz Do NOT Use Seeded Shuffle

### Current State

- **Diagnostic Quiz** (`DiagnosticQuiz.tsx`): Uses a deterministic seeded Fisher-Yates shuffle with `hashString(user.id + courseId)` and `mulberry32` PRNG. Same student always sees the same question order.

- **Exam Prep & Daily Quiz** (`AIChat.tsx` lines 181, 197): Uses `Math.random()` — fully random, non-deterministic. Question order changes on every page load/retry.

- **Static fallback** (`questionBank.ts` lines 57, 62): Also uses `Math.random()`.

### Plan: Apply Seeded Shuffle to Assessments

**1. Extract shared utility — `src/lib/seededShuffle.ts`**
- Move `hashString` and `mulberry32` from `DiagnosticQuiz.tsx` into a shared utility
- Export a `seededShuffle<T>(items: T[], seed: string): T[]` function that performs Fisher-Yates with the seeded PRNG

**2. Update `src/pages/student/AIChat.tsx`**
- Import `seededShuffle` from the shared utility
- In `handleStartExam` (line 181): replace `[...questions].sort(() => Math.random() - 0.5)` with `seededShuffle(questions, user.id + courseId)`
- In `handleStartQuiz` (line 197): same replacement
- Pass `user.id` from `useAuth()` (already available in the component)

**3. Update `src/data/questionBank.ts`**
- Update `getQuizQuestions` and `getExamQuestions` to accept an optional seed string parameter
- When seed is provided, use `seededShuffle`; otherwise fall back to `Math.random()` for backward compatibility

**4. Update `src/pages/student/DiagnosticQuiz.tsx`**
- Import `seededShuffle` from the shared utility
- Remove the local `hashString` and `mulberry32` functions
- Replace inline shuffle with `seededShuffle(mapped, user.id + courseId)`

### Files Modified
- `src/lib/seededShuffle.ts` — new shared utility
- `src/pages/student/AIChat.tsx` — use seeded shuffle for exam/quiz
- `src/data/questionBank.ts` — accept optional seed
- `src/pages/student/DiagnosticQuiz.tsx` — use shared utility, remove duplicated code

