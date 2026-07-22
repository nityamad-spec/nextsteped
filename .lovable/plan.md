## Phase 5 — Mastery update (reasoning boost / penalty)

Wire reasoning follow-up outcomes into the existing weighted `earned / max` ratio computed by the `update-mastery` edge function. No new tables, no new EMA/shrinkage/cap knobs — just an extra fractional-weight term inside the ratio already produced from `per_question`. Only `source === 'weekly_quiz'` uses it; other sources ignore the field.

### 1. Client mapper (`src/components/WeeklyQuizDialog.tsx` — `invokeUpdateMastery`)

- Extend the local `per_question` item shape to include an optional `reasoning_correct: boolean | null` and populate it from the answer entry:
  - `a.reasoning_is_correct === true` → `true`
  - `a.reasoning_is_correct === false` → `false`
  - `a.reasoning_is_correct === null` OR field absent → `null` (function treats as no-op)
- Only the primary rows already emitted by the mapper flow through; no new rows added. Reasoning follow-ups are NOT counted as separate primaries anywhere.
- Exam / practice / diagnostic callers of `update-mastery` are unchanged; their payloads never include `reasoning_correct`.

### 2. Function schema (`supabase/functions/update-mastery/index.ts`)

- Add `reasoning_correct: z.boolean().nullable().optional()` to `PerQuestionSchema`. Optional so exam/practice payloads validate unchanged.
- No change to `BodySchema`, no change to `PerConceptSchema`.

### 3. Config (`supabase/functions/update-mastery/mastery.ts`)

Add two named constants to `MASTERY_CONFIG` so future tuning is centralized:

```ts
REASONING_BOOST_FRACTION: 0.5,   // R
REASONING_PENALTY_FRACTION: 0.25, // P
```

No other config changes. Levels bands, EMA alphas, prior strength, and caps stay as-is.

### 4. Aggregation change (`index.ts`, inside the `body.per_question` loop, ~line 196–213)

Guarded by `body.source === "weekly_quiz"` so exams/practice are byte-identical:

```ts
const maxPoints = difficulty * bloomWeight;
cur.attempted += 1;
if (item.is_correct) cur.correct += 1;
cur.max     += maxPoints;
if (item.is_correct) cur.earned += maxPoints;

// Phase 5: reasoning follow-up contribution (weekly_quiz only).
if (body.source === "weekly_quiz" && item.is_correct && item.reasoning_correct !== null && item.reasoning_correct !== undefined) {
  const R = MASTERY_CONFIG.REASONING_BOOST_FRACTION;
  const P = MASTERY_CONFIG.REASONING_PENALTY_FRACTION;
  if (item.reasoning_correct === true) {
    cur.earned += R * maxPoints;
    cur.max    += R * maxPoints;
  } else { // reasoning_correct === false
    cur.max    += P * maxPoints;
    // no earned added — pulls ratio down
  }
}

cur.weighted = true;
```

- `cur.attempted` / `cur.correct` are NOT incremented for the follow-up. Counters, evidence-cap gating, and shrinkage `attemptedAfter` remain primary-only, matching the spec that a follow-up is not an extra primary quiz question.
- Because the primary's `earned` stays in the numerator whenever the primary is correct, the (correct-primary + wrong-reasoning) case is bounded below by the (wrong-primary) contribution for the same question — floor is automatic.

### 5. Downstream layers (no code changes)

- Beta-prior shrinkage (`PRIOR_STRENGTH=8`) uses `attemptedAfter` = primaries-only counter — unchanged.
- EMA blend (`weekly_quiz alpha = 0.4`) is applied on the shrunk signal produced from the new ratio — unchanged.
- Evidence-gated level caps (developing < 8 attempts, proficient < 15 or samples < 2) key off primary counters — unchanged.

Net effect: a single follow-up can nudge the ratio but cannot swing the displayed level on its own.

### 6. Tests (`supabase/functions/update-mastery/mastery_test.ts`)

Add a new test section `reasoning follow-up scoring`. Since the current `mastery.ts` exports pure helpers but the aggregation lives in `index.ts`, add a small pure helper to `mastery.ts` to keep it testable without a DB:

```ts
export function reasoningAdjustedContribution(
  maxPoints: number,
  primaryCorrect: boolean,
  reasoning: boolean | null | undefined,
): { earnedDelta: number; maxDelta: number } {
  const earnedBase = primaryCorrect ? maxPoints : 0;
  if (!primaryCorrect || reasoning == null) {
    return { earnedDelta: earnedBase, maxDelta: maxPoints };
  }
  const R = MASTERY_CONFIG.REASONING_BOOST_FRACTION;
  const P = MASTERY_CONFIG.REASONING_PENALTY_FRACTION;
  if (reasoning) {
    return { earnedDelta: earnedBase + R * maxPoints, maxDelta: maxPoints + R * maxPoints };
  }
  return { earnedDelta: earnedBase, maxDelta: maxPoints + P * maxPoints };
}
```

Refactor `index.ts` to call this helper inside the loop so the wire path and the tested path are the same code.

Test cases (each with `maxPoints = 1.0` for arithmetic clarity):

1. **primary correct + reasoning correct** — ratio = (1 + 0.5) / (1 + 0.5) = 1.0; assert > primary-alone ratio of 1.0 for a matching baseline where baseline is the same-primary case aggregated across multiple questions (use a two-question aggregate so the boost is observable, e.g. one primary-correct-with-boost + one primary-wrong → ratio (1 + 0.5) / (1 + 0.5 + 1) = 0.6 vs. baseline (1) / (1 + 1) = 0.5).
2. **primary correct + reasoning wrong** — same two-question aggregate: (1) / (1 + 0.25 + 1) = 1/2.25 ≈ 0.4444 vs. baseline 0.5. Assert lower than baseline (penalty).
3. **floor**: primary correct + reasoning wrong contribution ≥ primary wrong contribution for the same question — assert `earnedDelta_correctPrimaryWrongReason (=1.0) ≥ earnedDelta_wrongPrimary (=0)`.
4. **primary wrong** — reasoning ignored: `reasoningAdjustedContribution(1, false, true)` and `(1, false, false)` both equal `{ earnedDelta: 0, maxDelta: 1 }`.
5. **null / undefined reasoning** — `(1, true, null)` and `(1, true, undefined)` both equal `{ earnedDelta: 1, maxDelta: 1 }` — behaves as today.
6. **asymmetry**: for the two-question aggregate, `|baseline - penaltyRatio|` < `|boostRatio - baseline|` — penalty magnitude is smaller than boost magnitude. Baseline 0.5; boost 0.6 (Δ +0.1); penalty ≈ 0.4444 (Δ −0.0556). Assert `0.0556 < 0.1`.
7. **flipped case flagged in the plan**: an old test asserting "primary correct + reasoning wrong = no penalty" would now be wrong. Grep confirms no such test exists in `mastery_test.ts` today (the file predates reasoning follow-ups) — nothing to remove, only additions needed.

### 7. Out of scope for Phase 5

- No changes to analytics readers of `answers[]` (Phase 6).
- No changes to the `per_concept` code path — that legacy input has no per-question reasoning signal.
- No new persistent tables; reasoning contribution is folded into existing `student_concept_mastery` / `student_course_mastery` writes unchanged downstream.
- No teacher-facing surface change.
- No integration test additions beyond the pure math helper (integration_test.ts stays as-is unless the schema change breaks its fixture — will re-run it after implementation and patch only if red).

### Risks / constraints

- **Payload back-compat**: `reasoning_correct` is `optional().nullable()`, so older client builds and non-quiz callers keep validating. The guard on `body.source === "weekly_quiz"` is belt-and-suspenders in case a caller ever sets the field on a wrong source.
- **Ratio can exceed 1.0 without clamp**: the numerator picks up `R * maxPoints` from a correct follow-up while the denominator picks up the same amount, so the ratio can only reach 1.0, not exceed it. `clamp01` in `index.ts` still wraps the final ratio for safety.
- **`attemptedAfter` semantics**: because `cur.attempted` counts primaries only, the shrinkage denominator matches how students perceive quiz length. Follow-ups accelerate mastery-signal quality without inflating the "n" the cap uses to decide when to reveal proficient/expert.
- **Test refactor risk**: extracting `reasoningAdjustedContribution` and re-routing `index.ts` through it is a small mechanical change; verify by re-running existing `mastery_test.ts` (all pre-existing tests must still pass unchanged) and the aggregation integration test if present.
- **Null vs. false vs. absent** must survive the round-trip: `WeeklyQuizDialog.handleSubmit` writes `answers` as jsonb; `undefined` drops to absent, `null` survives as null. The mapper reads `a.reasoning_is_correct` with strict `===` checks, so absent and `null` collapse to the same "ignore" branch — consistent with the Phase 4 spec.

### Files touched

- `supabase/functions/update-mastery/mastery.ts` — add two config constants + `reasoningAdjustedContribution` helper.
- `supabase/functions/update-mastery/index.ts` — extend `PerQuestionSchema`; route the aggregation loop through the new helper under a `weekly_quiz` guard.
- `supabase/functions/update-mastery/mastery_test.ts` — new test block covering boost, penalty, floor, asymmetry, ignore-when-primary-wrong, and null/undefined safety.
- `src/components/WeeklyQuizDialog.tsx` — extend `invokeUpdateMastery` per-question payload to forward `reasoning_correct` from `answers[]`.