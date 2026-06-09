## Goal

Make the weekly quiz update concept mastery using a **weighted accuracy** signal — each question contributes `difficulty_estimate × BLOOM_WEIGHT[bloom_level]` instead of a flat 1 point. This is exactly how `score-diagnostic` computes `accuracyScore`. Pace and confidence stay diagnostic-only.

Scope: weekly quiz only. Exam and practice continue to use the existing flat correct/attempted signal (unchanged behavior). Diagnostic is unchanged (still writes only to `diagnostic_results`).

## Changes

### 1. `supabase/functions/update-mastery/index.ts`

Add a second, preferred input shape on the same endpoint:

```ts
per_question?: [{
  concept_id?: uuid,
  concept_code?: string,
  difficulty: number,      // 0..1
  bloom: number,           // 1..6
  is_correct: boolean
}]
```

`per_concept` stays as-is (back-compat for exam/practice/AIChat).

Behavior:
- If `per_question` is provided, group by resolved concept and compute per concept:
  - `earnedSum += difficulty × BLOOM_WEIGHT[bloom]` when correct
  - `maxSum += difficulty × BLOOM_WEIGHT[bloom]` always
  - `signal = clamp01(earnedSum / maxSum)` (replaces `correct/attempted`)
  - `questions_attempted` / `questions_correct` counters still increment by raw 1s so existing UI counts are unaffected.
- If only `per_concept` is provided, current path runs unchanged.
- Reuse the same `BLOOM_WEIGHT` constants from `score-diagnostic` (copy into the file's tuning block so update-mastery has no cross-function import).
- EMA blend, course-level weighted-average derivation, and table writes are unchanged.

Validation: zod schema accepts either `per_question` or `per_concept` (at least one, non-empty).

### 2. `src/components/WeeklyQuizDialog.tsx`

- Extend the `assessment_questions` select to include `difficulty_estimate, bloom_level` and carry them into the `Question` objects (or a side map keyed by `id`).
- In `invokeUpdateMastery`, drop the tally step and instead send `per_question`:

```ts
per_question: results.answers.map(a => ({
  concept_code: a.topic,
  difficulty: questionMeta[a.question_id].difficulty_estimate,
  bloom: questionMeta[a.question_id].bloom_level,
  is_correct: !!a.is_correct,
}))
```

- `source` and `source_id` are unchanged.

### 3. Tests

- `src/components/WeeklyQuizDialog.test.tsx`: update the seeded `assessment_questions` row to include `difficulty_estimate` and `bloom_level`, and update the expected `invokeMock` payload assertion from `per_concept: [...]` to `per_question: [{ concept_code:"ARITH", difficulty:..., bloom:..., is_correct:true }]`.
- No change to `StudentHome.test.tsx` (it doesn't go through the edge function).

### 4. Out of scope

- Exam (`AIChat.tsx` exam path) and practice (`AIChat.tsx` practice path) continue to send `per_concept` and use flat accuracy. Switching them is a separate decision.
- No DB schema changes. No backfill. No changes to course-mastery weighting or learner-level bands.

## Technical notes

- `assessment_questions` already stores `difficulty_estimate numeric(3,2)` (0..1) and `bloom_level int` (1..6) — same semantics as `diagnostic_questions`, so no normalization needed.
- Weighted signal preserves the EMA contract: it's still a 0..1 value blended with the prior via `EMA_ALPHA = 0.4`.
- When all questions in a concept are bloom=1 and difficulty=0.5, the new signal equals the old `correct/attempted` ratio, so legacy comparisons stay sensible.
- The `update-mastery` header comment should be updated to document the two input shapes and that `per_question` is the preferred shape going forward.
