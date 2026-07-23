# Phase 8 — Align weekly-quiz scoring with diagnostic (80% accuracy + 20% pace)

Replace the current weighted-accuracy-only score in `AssessmentView.handleFinish` (for `type === "quiz"`) with the same formula `score-diagnostic` uses, computed client-side. Historical `assessment_results` rows are left as-is.

## Current behavior (to replace)

`src/components/AssessmentView.tsx` (lines ~195–215) computes two scores:
- `flatScore = correct / total * 100`
- `weightedScore = Σ(earned) / Σ(maxPoints) * 100`, where `maxPoints = difficulty × BLOOM_WEIGHT[bloom]`

It stores `score = weightedScore ?? flatScore`. There is no pace component. Reasoning follow-ups already flow into `answers[]` but do not affect the displayed score.

## Target formula (mirrors `supabase/functions/score-diagnostic/index.ts`)

```
accuracyScore = Σ(earned) / Σ(maxPoints)          // primaries + reasoning (see below)
paceScore     = mean(paceCurve(actualMs / expectedMs))  // primaries only
masteryScore  = 0.80 * accuracyScore + 0.20 * paceScore
displayScore  = round(masteryScore * 100)
```

Constants copied verbatim from `score-diagnostic` CONFIG:
- `BLOOM_WEIGHT { 1:1.0, 2:1.2, 3:1.5, 4:1.8, 5:2.1, 6:2.5 }`
- `EXPECTED_TIME_BASE_MS { 1:20k, 2:30k, 3:45k, 4:60k, 5:80k, 6:110k }`
- `DIFFICULTY_TIME_FACTOR(d) = 0.6 + 1.0 * clamp01(d)`
- `paceCurve` (guess floor 0.2, fast cutoff 0.25, slow decay 2.0)
- `WEIGHTS { accuracy: 0.80, pace: 0.20 }`

## Reasoning follow-up contribution to displayed score

Reuse the Phase 5 numerator/denominator math so on-screen score reflects the same signal `update-mastery` uses:

```
For each primary i with maxPoints_i = difficulty_i × BLOOM_WEIGHT[bloom_i]:
  earned        += is_correct ? maxPoints_i : 0
  maxPoints_sum += maxPoints_i

  if is_correct && reasoning_is_correct === true:
      earned        += 0.5 * maxPoints_i        // REASONING_BOOST_FRACTION
      maxPoints_sum += 0.5 * maxPoints_i
  else if is_correct && reasoning_is_correct === false:
      maxPoints_sum += 0.25 * maxPoints_i       // REASONING_PENALTY_FRACTION (denominator only)
  // reasoning_is_correct === null → ignored
  // primary incorrect → reasoning ignored
```

Pace uses **primaries only** (matches diagnostic; reasoning items don't have calibrated expected times and adding them would distort pace).

`correctAnswers` and `totalQuestions` continue to count primaries only — no analytics regression.

## Files touched

1. **`src/components/AssessmentView.tsx`** (quiz-only branch of `handleFinish`)
   - Add local `BLOOM_WEIGHT`, `EXPECTED_TIME_BASE_MS`, `paceCurve`, `clamp01` constants matching `score-diagnostic`. (Note: `BLOOM_WEIGHT` already exists in the file; reuse it and verify parity.)
   - Compute `accuracyScore` including reasoning boost/penalty as above.
   - Compute `paceScore` from `questionTimes[q.id]` (ms) using `EXPECTED_TIME_BASE_MS[bloom] * DIFFICULTY_TIME_FACTOR(difficulty)`; skip questions with missing/zero time (fallback to expected → pace 1.0), matching diagnostic.
   - `score = round((0.80 * accuracy + 0.20 * pace) * 100)`.
   - Only apply to `type === "quiz"`. Exam / practice keep existing math.
   - Keep `flatScore` and `weightedScore` fields on `AssessmentResults` for backward compatibility (existing review UI reads them); add optional `paceScore` and `accuracyScore` fields for future analytics.

2. **`src/data/questionBank.ts` / result types** — extend `AssessmentResults` with optional `accuracyScore` and `paceScore` (0..1).

## Non-goals

- No edge function (`score-weekly-quiz` deferred).
- No changes to `update-mastery` — Phase 5 math is unchanged.
- No changes to `assessment_results` schema.
- No backfill of historical rows.
- No changes to exam or practice scoring.

## Risks

- **Score drops on the same performance.** Adding a 20% pace factor typically lowers scores for slow-but-correct students. Acceptable and intended (matches diagnostic).
- **`questionTimes` reliability.** If per-question timing is ever missing (older sessions, race conditions), pace defaults to 1.0 for that item — no crash, but pace signal is weakened. Verified `AssessmentView` already tracks `questionTimes` per question.
- **Constants drift.** Constants are duplicated between client and `score-diagnostic`. Mitigation: colocate in a small `src/lib/masteryScoring.ts` module and document that it must stay in sync with the edge function's CONFIG. A future edge-function migration (option B/C) would collapse the duplication.
- **Reasoning-in-accuracy vs mastery double count.** The displayed score and `update-mastery` both apply the boost/penalty. This is intentional (student sees the same signal that drives mastery), but worth flagging.

## Test updates

- Extend `src/components/WeeklyQuizDialog.test.tsx` with a case asserting the submitted `score` reflects the 80/20 split (e.g., all-correct + slow answers scores below 100).
- Add a unit test on the new scoring helper (if extracted to `src/lib/masteryScoring.ts`) covering: all-correct fast, all-correct slow, half-correct, reasoning boost, reasoning penalty, missing timings.
- Per the `no-auto-fix-on-test-failure` rule, any failing tests will be reported for approval before code changes.
