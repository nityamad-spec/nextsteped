## Root cause

On `/student/chat`, `handleStartExam` and `handleStartExamWithSettings` in `src/pages/student/AIChat.tsx` shuffle the professor's exam questions and then slice to a `count` derived from TA settings (`taSettings.examManualCount`, defaulting to ~15 for a 45-min exam, and typically set to 20 in your setup). So Final 1's 22 authored questions get truncated to 20 before being handed to the assessment view.

The rest of the pipeline (fetch by `exam_id`, assessment UI, submission) already handles the full array — the cap is the only bottleneck.

## Fix

For **manual (professor-authored) exams** we should trust the professor and serve every question they added; the TA-settings length cap should only apply to AI-generated exams (or be removed entirely for exams driven by an explicit `examId`).

### Changes in `src/pages/student/AIChat.tsx`

1. `handleStartExam` (~line 568):
   - After fetching, if `examId` is present, set `count = questions.length` (i.e. do not slice). Keep the seeded shuffle for question order.
2. `handleStartExamWithSettings` (~line 598):
   - Same treatment: when an `examId` is resolved, ignore `custom.questionCount` for the upper bound and use the full pool length (still honoring the `questionMix` type filter and shuffle).
   - Keep `custom.timeLimit` behavior unchanged.

No backend, schema, or ExamMode UI changes are needed — the questions already exist in `assessment_questions` scoped to the exam.

## Verification

- Reload `/student/chat`, start Final 1 → confirm 22/22 questions are presented.
- Confirm quizzes (unchanged path) still respect `quizNumQuestions`.
