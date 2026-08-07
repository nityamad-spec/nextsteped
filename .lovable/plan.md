# Reasoning-weighted scoring

Bloom 3+ questions already collect a written rationale that an LLM marks `accepted` or `rejected`. Today that verdict is stored but has zero effect on any score. This change makes the verdict move the score, everywhere.

## Scoring rule

Per question, points earned change; the maximum points a question is worth never changes (so a 100% ceiling stays a 100% ceiling and old scores stay comparable).

```text
maxPoints = difficulty x bloomWeight[bloom]          (unchanged)

Bloom 1-2, or no rationale required:
  earned = correct ? maxPoints : 0                   (unchanged)

Bloom 3+:
  correct + accepted            -> earned = maxPoints
  correct + no verdict          -> earned = maxPoints        (never punish an AI failure)
  correct + rejected            -> earned = difficulty x 1.2 (Bloom-2 weight, capped at maxPoints)
  incorrect + accepted          -> earned = maxPoints x 0.25 (partial credit)
  incorrect + rejected/none     -> earned = 0
```

Guaranteed ordering, which the tests will lock in: correct+accepted > correct+rejected > incorrect+accepted > incorrect.

## Suggested improvements to the proposed logic

1. **Cap, do not raise.** At Bloom 3 the real weight is 1.5 and the rejected weight 1.2, a 20% haircut. At Bloom 6 (2.5) it is a 52% haircut, so the penalty silently scales with Bloom. Recommend keeping the flat 1.2 rule as asked but clamping so the rejected value can never exceed the true weight (relevant if a Bloom-1/2 question ever collects a rationale).
2. **Missing verdict = accepted.** Confirmed. Also log the count of unverified rationales per attempt so a silent gateway outage is visible rather than inflating scores unnoticed.
3. **Partial credit factor as a named constant** (`REASONING_PARTIAL_CREDIT = 0.25`) alongside `REASONING_REJECTED_WEIGHT = 1.2`, in one shared config so the four surfaces cannot drift.
4. **Do not let reasoning touch pace.** Pace stays purely time-based; only the accuracy component moves. This keeps the 80/20 blend interpretable.
5. **Expose the components.** Return `accuracy`, `pace`, and a new `reasoningAdjustment` (delta vs. the verdict-free score) so results screens and analytics can explain why a score differs from raw correctness.
6. **Feature flag it** (`REASONING_SCORING_ENABLED`) so it can be switched off without a redeploy chain if the LLM verdicts prove noisy.

## Phases

### Phase 1 — Shared config and pure function
- Extend `src/lib/reasoning.ts` with `REASONING_REJECTED_WEIGHT`, `REASONING_PARTIAL_CREDIT`, and `reasoningEarnedFactor({ bloom, isCorrect, verdict })` returning the multiplier applied to `maxPoints`.
- Mirror the same constants and helper in a Deno-side copy for edge functions (they cannot import from `src/`), with a comment marking the two as a synced pair, matching the existing `masteryScoring.ts` / `score-diagnostic` convention.
- Unit tests for every branch plus the ordering invariant.

### Phase 2 — Weekly quiz and exam display score
- `src/lib/masteryScoring.ts`: `ScoreItem` gains optional `verdict` and `bloom` is already present; `computeWeeklyQuizScore` applies the factor to `earned` only.
- `src/components/AssessmentView.tsx`: when building `ScoreItem[]`, read the verdict from the reasoning hook's evaluations (after `flushAndWait`, so late verdicts are included) and pass it through. Apply to exam mode as well as quiz mode.

### Phase 3 — Practice tests
- `PracticeQuestionsWidget.tsx`: same factor applied wherever the practice score is computed, using the same helper.

### Phase 4 — Diagnostic
- `DiagnosticQuiz.tsx` sends each answer's verdict in the `score-diagnostic` payload (the rationale rows are written after the result row, so the edge function cannot read them from the table).
- `score-diagnostic/index.ts`: accept optional `reasoning_verdict` per answer, apply the factor to `earned`, keep `maxSum` and pace untouched, and return the new `reasoning_adjustment` component.

### Phase 5 — Mastery
- `update-mastery`: `PerQuestionSchema` gains optional `reasoning_verdict`; the per-concept `earned` accumulation applies the same factor. `attempted` / `correct` counters stay based on primary correctness only, so evidence gates and level caps are unaffected.
- All four callers pass the verdict through.

### Phase 6 — Tests
- Deno tests for `score-diagnostic` and `update-mastery` covering the four verdict/correctness combinations and confirming `max` is unchanged.
- Vitest coverage in `masteryScoring.test.ts` and an `AssessmentView` submission test asserting the verdict reaches the score and the persisted payload.

## Risks and constraints

- **No DB migration needed.** Verdicts already live on `student_answer_rationales`; scoring reads them from client memory at submit time and passes them to the edge functions.
- **Two code copies of the constants.** Browser and Deno cannot share a module here; drift is the main long-term risk, mitigated by mirrored tests.
- **Verdict timing.** A verdict that lands after the 8s `flushAndWait` deadline is treated as "no verdict" — the score is computed without it and is not retroactively corrected. Recomputing historical scores is out of scope.
- **LLM reliability.** A wrong `rejected` verdict directly costs a student marks on a question they answered correctly. The flag in improvement 6 plus the unverified-count logging are the safety valves.
- **Historical comparability.** Attempts scored before this change have no reasoning adjustment, so cohort trends across the cutover date are not apples-to-apples. No backfill planned.
