# Weight exam scoring by difficulty × Bloom (Exam Prep mode on /student/chat)

## Goal
Make exams use the same weighted scoring formula as weekly quizzes:

```
score = Σ (difficulty × BLOOM_WEIGHT[bloom]) over CORRECT
      / Σ (difficulty × BLOOM_WEIGHT[bloom]) over ATTEMPTED
```

with `BLOOM_WEIGHT = {1:1.0, 2:1.2, 3:1.5, 4:1.8, 5:2.1, 6:2.5}` (mirrors `update-mastery`).

This affects both **(a)** the student-visible exam score and **(b)** the per-concept mastery signal sent to the backend (today the exam path sends only correct/attempted counts and the backend falls back to the unweighted branch).

## Current state
- `src/components/WeeklyQuizDialog.tsx` already collects a `questionMeta: Map<id, {difficulty, bloom}>` from `assessment_questions.difficulty_estimate` and `bloom_level`, and forwards per-question rows to `update-mastery` → weighted branch runs server-side.
- `src/pages/student/AIChat.tsx` (exam prep) ignores those columns. Its local `invokeUpdateMastery` aggregates only `{attempted, correct}` per concept → server takes the unweighted branch.
- `src/components/AssessmentView.tsx` computes the visible score as a flat `correct / total` regardless of source.

## Changes

### 1. `src/components/AssessmentView.tsx`
- Add an optional prop `questionMeta?: Map<string, { difficulty: number; bloom: number }>` (default empty).
- In `handleFinish`, if every attempted question has meta, compute `score` with the weighted formula above; else keep the current flat `correct/total`. `correctAnswers` / `totalQuestions` remain raw counts (display unchanged: "X%  ·  C/T").
- Add `weightedScore?: number` and `flatScore?: number` to `AssessmentResults` so downstream code can log both. `score` continues to be the headline number shown to the student (now weighted when meta is present).

### 2. `src/pages/student/AIChat.tsx`
- In `fetchDBQuestions`, also build and return a `Map<id, {difficulty, bloom}>` from `row.difficulty_estimate` (fallback 0.5) and `row.bloom_level` (fallback 1). Store it in a new state `examQuestionMeta`.
- Pass `questionMeta={examQuestionMeta}` into `<AssessmentView />`.
- Rewrite the top-level `invokeUpdateMastery` helper (or add a second variant) to mirror `WeeklyQuizDialog`'s payload shape: send per-question `{ concept_code, difficulty, bloom, is_correct }`. The `update-mastery` edge function already supports that input and will run the weighted branch + EMA blend.
- Keep the practice-questions call site (`handlePracticeResult`) on its existing aggregate path — user did not request a change there.

### 3. No backend changes
`supabase/functions/update-mastery/index.ts` already handles the weighted per-question payload. No migration, no schema change.

### 4. Tests / verification
- Update `src/components/WeeklyQuizDialog.test.tsx` only if assertions on `score` shape break (unlikely — same formula path).
- Manual: run an exam on `/student/chat`, mix difficulties, intentionally miss an easy/low-Bloom question — visible score should be > flat %; intentionally miss the hardest — visible score should drop more than flat %. Confirm `student_concept_mastery` rows reflect weighted signal (not just correct/attempted ratio).

## Out of scope
- Practice questions widget (unchanged).
- Diagnostic quiz (already has its own weighted pipeline).
- DB schema, mastery thresholds, course-mastery rollup.

## Technical notes
- Bloom clamp: `Math.min(6, Math.max(1, Math.round(bloom)))` to match server.
- Difficulty clamp: `Math.min(1, Math.max(0, difficulty))`.
- When meta is missing for some questions in a mixed batch (e.g. fallback static `getExamQuestions`), default each to `{difficulty: 0.5, bloom: 1}` so the formula degrades gracefully to ≈ flat scoring.
