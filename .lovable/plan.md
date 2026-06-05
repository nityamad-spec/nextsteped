## Goal

Compute a single **course-level mastery score (0–1)** and a **learner level** (beginner / developing / proficient / expert) for each diagnostic submission, in one edge function, with all tuning numbers in a named config block.

## Table & column mapping (confirmed)

**`diagnostic_results`** — write target. One row per (student, course) attempt. Existing fields used: `student_id`, `course_id`, `score`, `total_questions`, `branch_tier`, `answers`, `confidences`, `question_times`, `question_ids`.

**Schema change (one migration, asked separately before build):**
- Add `mastery_score numeric(5,4)` — null allowed for legacy rows.
- Change `learner_level` vocabulary from `Beginner|Progressing|Proficient|Expert` → `beginner|developing|proficient|expert`.
  - Backfill existing rows: `Beginner→beginner`, `Progressing→developing`, `Proficient→proficient`, `Expert→expert`.
  - Same backfill on `profiles.learner_level`.
  - Update every TS reference (`src/lib/diagnosticsAnalytics.ts`, `useStudentStatus.ts`, `AssessmentAnalytics.tsx`, `AdminStudents.tsx`, `complete-student-signup`, `chat` function, `types/index.ts`, `DiagnosticQuiz.tsx`) to the new lowercase vocab.

**`diagnostic_questions`** — read source for `difficulty_estimate` (numeric, ~0–1) and `bloom_level` (1–6), joined by `id` from `answers[].question_id`.

## New edge function: `supabase/functions/score-diagnostic/index.ts`

**Invocation:** called from `DiagnosticQuiz.tsx` on submit, replacing the current inline `computeLearnerLevel(correct,total)` + insert.

**Request body:**
```json
{
  "course_id": "<uuid>",
  "branch_tier": "easy|medium|hard|null",
  "answers": [ /* same shape currently built in DiagnosticQuiz */ ],
  "confidences": [ ... ],
  "question_times": [ ... ],   // ms
  "question_ids": [ ... ]
}
```

**Auth:** validate JWT in code; `student_id = auth.uid()`. Defensive duplicate-check (same as today) before insert.

**Flow:**
1. Validate body with zod.
2. Load `diagnostic_questions` rows for `question_ids ∩ course_id` in one query; build a `Map<id, {difficulty, bloom}>`.
3. For each answer where `response` is non-empty:
   - If `question_id` not in map → drop + log (`console.warn`), never count as wrong.
   - Trust client `is_correct`.
   - Compute per-question: `max_points = difficulty × BLOOM_WEIGHT[bloom]`, `earned = is_correct ? max_points : 0`.
   - Compute `expected_ms = EXPECTED_TIME_BASE_MS[bloom] × DIFFICULTY_TIME_FACTOR(difficulty)`; `pace_i = paceCurve(time_ms / expected_ms)`.
4. Aggregate:
   - `accuracyScore = Σ earned / Σ max_points` (0..1).
   - `paceScore    = mean(pace_i)` (0..1).
   - `confidenceScore = mean(confidence_i) / 5` (assuming 1–5 scale; clamp 0..1).
5. `masteryScore = clamp01(W.accuracy*accuracyScore + W.pace*paceScore + W.confidence*confidenceScore)`.
6. `learner_level = bandFor(masteryScore)` using equal 25% bands with the boundary rule (lower inclusive, upper exclusive, except top band includes 1.0).
7. Insert row into `diagnostic_results` with `score = correctCount`, `total_questions = answered count after drops`, `mastery_score`, `learner_level`, plus all jsonb fields.
8. Also update `profiles.learner_level` (mirrors existing behavior).
9. Respond `{ mastery_score, learner_level, dropped_question_ids }`.

## Config block (single object, top of file)

```ts
const CONFIG = {
  // Cognitive depth weights (Bloom 1..6)
  BLOOM_WEIGHT: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5 },

  // Expected solve time per bloom level, in ms (baseline at difficulty 0.5)
  EXPECTED_TIME_BASE_MS: { 1: 20_000, 2: 30_000, 3: 45_000, 4: 60_000, 5: 80_000, 6: 110_000 },
  DIFFICULTY_TIME_FACTOR: (d: number) => 0.6 + 1.0 * clamp01(d), // 0.6x at d=0 → 1.6x at d=1

  // Pace curve: r = actual/expected
  // - r < 0.25  → 0.2  (too-fast / guessing floor)
  // - 0.25..1.0 → smooth ramp to 1.0 at r=1
  // - r > 1.0   → exp(-(r-1)/2.0)  (gentle decay, no cliff)
  PACE_GUESS_FLOOR: 0.2,
  PACE_FAST_CUTOFF: 0.25,
  PACE_SLOW_DECAY: 2.0,

  // Final combination weights (must sum to 1.0)
  WEIGHTS: { accuracy: 0.70, pace: 0.15, confidence: 0.15 },

  // Learner-level bands (lower inclusive, upper exclusive; top band includes 1.0)
  LEVEL_BANDS: [
    { max: 0.25, level: "beginner" },
    { max: 0.50, level: "developing" },
    { max: 0.75, level: "proficient" },
    { max: 1.01, level: "expert" }, // 1.01 so 1.0 lands here
  ],
} as const;
```

**Defaults rationale (for review):**
- Accuracy dominates (0.70). Pace and confidence are 0.15 each — adjustments, not backbone.
- Bloom weights grow ~linearly; recall worth 1.0, synthesis worth 2.5.
- Expected times scale with both bloom (base) and difficulty (0.6×–1.6×).
- Pace curve has a hard low floor for very-fast answers (likely guesses) but only gentle decay for slow answers (don't punish careful thinkers).

## Client-side change

`src/pages/student/DiagnosticQuiz.tsx` — replace the `from("diagnostic_results").insert(...)` block (≈lines 427–488) with one `supabase.functions.invoke("score-diagnostic", { body })` call. Use returned `learner_level` to update `studentProfile` and navigate.

## Out of scope

- No changes to weekly-quiz scoring or `assessment_results`.
- No teacher/student UI surfacing of `mastery_score` (per Core memory: mastery hidden from both roles).
- No backfill of `mastery_score` for historical diagnostic_results rows (left null).

## Open question for you

Confidence scale — the current `confidences` jsonb in `diagnostic_results` is written by `DiagnosticQuiz.tsx`. **Is it 1–5 or 0–4 or 0–1?** I've assumed 1–5 (divide by 5). If it's different, only the normalizer constant changes. I'll verify by reading the quiz component during build and adjust before deploying.

