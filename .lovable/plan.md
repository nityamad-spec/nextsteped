# Fix: standard-tier diagnostic regen stuck at 8/10

## Root cause (from run 57fa66a4 logs)

`generate-diagnostic-questions` regen for CL01 standard tier repeatedly finishes at 8/10:

1. Preseed loads 8 existing rows, but `computeTierQuota` re-randomizes the per-concept quota every run. One preseeded row lands on a concept whose fresh quota is 0, so it's dropped → **preseed shrinks 8 → 7**.
2. Attempt 1 asks the model for 3 new questions. 3 come back, but the LENGTH PARITY validator (`maxLen/minLen > 1.6`, line 314) rejects 2 for `option length imbalance 8->15`. Only 1 survives → cumulative 8.
3. Attempt 2 asks for 2 more. Same imbalance rejection → cumulative still 8.
4. `spec.maxAttempts = 2` is exhausted → tier ends `failed`, UI stays at 8/10 forever because every re-run repeats the same pattern.

So the tier is **starved by strict LENGTH PARITY rejections combined with too-tight attempts and a per-run quota reshuffle that erodes preseed**.

## Fix — three narrow changes to `supabase/functions/generate-diagnostic-questions/index.ts`

### 1. Stable quota for partial (tier-only) regens (lines 890–910)

Pass an `isPartialRun` flag into `runTier` (or reuse `ctx`) and, when true, **build the quota from the preseed distribution first**, then top up the remainder with `computeTierQuota` seeded deterministically on `(courseId, tier)` instead of `Date.now()`. This guarantees preseeded rows always satisfy the fresh quota — no more 8 → 7 shrinkage on regen.

```text
if (isPartialRun) {
  for row in preSeed: quota[row.topic] = (quota[row.topic] ?? 0) + 1  // lock in what we already have
  distribute (spec.count - preSeed.length) remaining across other concepts via computeTierQuota
}
```

Full runs (all 4 tiers) keep the current random quota — nothing to preserve.

### 2. Over-generate on regen attempts to absorb validator drops (lines 597–601)

Today only `hard` over-generates. Extend the same pattern to **any tier where `needed < spec.count` (i.e. a top-up regen)**:

```text
const isTopUp = needed < spec.count;
const askFor = (spec.tier === "hard" || isTopUp)
  ? Math.min(overgenCap, Math.ceil(needed * 1.75))
  : needed;
```

For `needed=2`, we ask for 4 candidates so a 50 % validator drop still lands the required 2. Cap at `overgenCap` (already defined) so we never blow the JSON size.

### 3. Raise `maxAttempts` from 2 → 3 for standard/easy/medium (line 124–126)

Matches `hard` and gives the retry loop one more shot when validator rejections hit. Combined with (2), the 3rd attempt is a safety net, not the primary mechanism.

### 4. Add an explicit LENGTH-PARITY warning to `retryHint` (line 964)

When `reasons` contains `option length imbalance`, prepend a stronger sentence to `retryHint` so the model actually reacts on attempt 2/3:

```text
"CRITICAL: previous attempt rejected N option-length-imbalance failures. Every option MUST be within ±20% character length of the correct one. Rewrite distractors to match the correct option's length and syntactic shape."
```

Uses existing `reasons`/`retryHint` plumbing — no new state.

## Verification

1. On `/teacher/setup/diagnostic`, click **Regenerate** on standard for CL01.
2. Query `diagnostic_generation_runs` — the standard row should progress `accepted: 8 → 10`, `status: done`.
3. Check `diagnostic_generation_events` for the run: expect `preseed_loaded standard:8`, no `preseed_loaded standard:7`, and the last `validation_summary` at `cumulative 10/10`.
4. Full-run regen (all 4 tiers) still finishes inside the 145 s deadline — worst case per tier is now `3 attempts × 80 s = 240 s`, but the existing `budgetLeft` guard at line 729 already short-circuits attempts that won't fit.

## Risks & impact on other parts of the edge function

- **Deadline pressure on full runs.** Raising `maxAttempts` to 3 for three tiers in parallel could push the total closer to the 150 s Supabase invoke ceiling. Mitigated by the existing per-attempt `budgetLeft` check (lines 727–730) which converts overruns into `DeadlineExceededError` and skips gracefully. No code change needed there, but worth watching in logs.
- **Token & credit cost.** Over-generation on top-ups increases prompt+completion tokens roughly 1.75× on regen calls. Full generations are unchanged. Acceptable trade because today's top-ups fail entirely and waste all their tokens.
- **`hard` tier over-generation double-up.** Hard already multiplies by 1.5; a top-up on hard would now multiply by 1.75. Trivial and still under `overgenCap`.
- **Preseed quota lock (fix 1).** If preseed already contains 10 items but they're skewed toward one concept, the deterministic quota will honor that skew instead of the ideal distribution. Only affects tier-only regens; the initial full run still enforces even distribution. Acceptable — regen should preserve prior work, not rebalance it.
- **Prompt changes are additive** — no format/schema changes, so downstream JSON parsing, `validateMcq`, and DB insert paths are unaffected.
- **UI / progress rows** (`diagnostic_generation_runs`, event stream) unchanged — the `AdminDiagnosticRuns` and setup-page progress UI keep working as-is.

## Not doing

- Loosening the 1.6× LENGTH PARITY threshold — that's a real quality guard; the fix is to make the model comply, not to lower the bar.
- Widening the difficulty/bloom band for standard — we haven't seen those trigger the stall.
- Any change to `callGateway`, `validateMcq`, or the tool schema.
- Any client-side change on `/teacher/setup/diagnostic` — the UI already renders whatever `accepted` count the run reports.
