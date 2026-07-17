# Guarantee 5 questions per tier in `generate-weekly-quiz`

Goal: each of the four tiers (`standard`, `easy`, `medium`, `hard`) ships **exactly 5 items** whenever the global deadline allows, using the **same validators and difficulty band** already enforced by `validateCandidate` + `_shared/question-validation.ts`. No relaxed rules, no tier-specific criteria drift.

## Where shortfall comes from today

In `supabase/functions/generate-weekly-quiz/index.ts`:

1. `generateTier` exits early when `attempt >= maxAttempts` (2) even if `accepted.length < 5`.
2. Over-generation buffer is only `subNeed + 1` — a single validator rejection leaves the sub-call short.
3. Post-assembly cross-tier dedup (lines ~717–732) drops from lower-priority tiers but **does not top them back up**.
4. Backfill loop (lines ~742–787) runs **once per tier** with `maxAttempts: 1`, no retry if it also comes back short.
5. Backfill guard skips if `deadlineAt - Date.now() < 12_000`; because the main pass runs all four tiers in parallel with 25–30s timeouts + 2 attempts, budget can be tight when it starts.

## Fix (single file: `supabase/functions/generate-weekly-quiz/index.ts`)

### 1. Larger over-generation buffer in `generateTier`
- Change `askFor = subNeed + 1` → `askFor = Math.min(subNeed + 2, spec.batchSize + 2)`.
  Absorbs one validator rejection per batch without forcing another sub-call.

### 2. Reserve deadline budget for backfill
- Split the wall clock: main pass gets `deadlineAt - 45_000`, backfill phase gets the remaining ~45s.
- Pass a `mainPassDeadline` into the initial `Promise.allSettled` so main-tier calls stop early enough to leave room for guaranteed backfill.

### 3. Bounded "guarantee" backfill loop
Replace the single-pass backfill (lines ~742–787) with a loop:

```text
for pass in 1..3:
    shortTiers = tiers where accepted count < spec.count
    if none: break
    if deadlineAt - now < 10_000: break
    run backfill for shortTiers in PARALLEL:
        - focusConcepts = auditBatchQuotas(...).shortfall  (same helper as today)
        - maxAttempts = 2 (was 1)
        - avoid = every accepted question across every tier
        - count = per-tier shortfall
    merge results with isLikelyDuplicate check against full accepted set
```

- Each pass reuses `generateTier` unchanged → identical validators, identical difficulty band, identical dedup.
- Parallel pass keeps wall-clock cost near a single tier's latency.
- Loop cap of 3 prevents runaway; deadline guard prevents overshoot.

### 4. Cross-tier dedup priority stays the same, losers get topped up
Existing priority order (`standard → hard → medium → easy`) is preserved for cross-tier dedup. The new backfill loop then fills whichever tier lost items, using the full accepted pool as `crossTierAvoid` so we do not reintroduce duplicates.

### 5. Consistent request semantics
Every backfill call goes through the same `generateTier` → same:
- `validateStructural` (format, options, length parity, prefix checks)
- `normalizeAnswer` + `validateOptionParity`
- `validateConcept` against the same `conceptByCode`
- `validateDifficulty` with the tier's `midpoint ± 0.15`
- `validateBloom` with `enforceDifficultyConsistency: true`, same 1–4 range
- `validateExplanation`
- `dedupWithin` + `isLikelyDuplicate`

No tier-specific loosening. If the model cannot produce a compliant item within the deadline, the response still reports `partial: true` and per-tier counts, but the guarantee loop makes partial outcomes rare.

### 6. Response shape unchanged
Same JSON: `{ ok, generated, requested, partial, by_tier, tier_errors }`. `partial` becomes `true` only when the deadline expires before every tier reaches 5.

## Out of scope
- No changes to `_shared/question-validation.ts` (validators stay canonical).
- No schema/DB changes.
- No changes to any other edge function or client code.
- Model stays `google/gemini-2.5-flash`; tier timeouts and `maxAttempts` unchanged from the prior fix.
