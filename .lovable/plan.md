## Changes to `src/components/CourseAnalyticsView.tsx`

### 1. Exams — add completion breakdown (parallels weekly quizzes)

Add three new stats using **active exams only** (already `stats.examsTotal` via `activeExamByStudent`):

- `examCompletedAll`  — students where `activeExamByStudent[sid].size >= examsTotal` (and `examsTotal > 0`)
- `examCompletedOne` — students who completed ≥1 active exam. When `examsTotal === 1` this equals `examCompletedAll` by definition (both rows show the same students, per spec).
- `examNotStarted`   — enrolled students with no active-exam attempts.

Extend `Stats` with `examCompletedAll: StudentLite[]`, `examCompletedOne: StudentLite[]`, `examNotStarted: StudentLite[]`. Compute inside the same `stats` memo (loops over `enrolledIds`, no new fetch).

Render three `QuizRow`s in the Exams card mirroring the weekly-quizzes card:

```
Completed all {examsTotal}     N   (click → roster)
Completed ≥1 exam              N   (click → roster)     // hidden when examsTotal === 0
Not started                    N   (click → roster)
```

Existing "Students attempted / Total attempts / Avg score" rows stay below.

Add three roster views: `exam-completed`, `exam-one`, `exam-not-started`.

### 2. Weekly quizzes — add "Students attempted"

Add a caption row mirroring the exam card, using existing `stats.quizStudents`:

```
Students attempted: {quizStudents}
```

Placed right above "Total attempts". No new state.

### Out of scope
- No backend, no new queries.
- No changes to Course completion, mastery, chat, or exports.
- Archived exams remain excluded (consistent with existing `activeExamByStudent`).
