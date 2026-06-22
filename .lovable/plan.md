## Root cause

In `supabase/functions/generate-diagnostic-questions/index.ts` (line 114), the `standard` tier has no `batchSize` and no `perCallTimeoutMs`, so it issues a single gateway call asking for all 10 questions with the default 35s `GATEWAY_CALL_TIMEOUT_MS` cap. When that call exceeds 35s (frequent for 10 MCQs with the joint quota + categorized-justifications + tool-call JSON schema), `callGatewaySingle` throws, and because there's only one chunk, `callGateway` has no partial candidates to return — the tier ends at 0/10. Hard tier already avoids this via `batchSize: 5` + `perCallTimeoutMs: 80_000`, which is why hard reached 10/10 while standard reached 0/10.

`easy` and `medium` share the same fragile single-call config and only succeeded this run by luck.

## Change

Edit `TIER_SPEC` in `supabase/functions/generate-diagnostic-questions/index.ts` (lines 113–127) to apply the hard-tier partial-generation pattern to all 10-question tiers:

- `standard`: add `batchSize: 5`, `perCallTimeoutMs: 80_000`. Keep `count: 10`, `maxAttempts: 2`. (No over-generation — only hard tier has the 1.5× over-gen branch in `callGatewaySingle` line 583, and that's intentional.)
- `easy`: add `batchSize: 5`, `perCallTimeoutMs: 80_000` for the same robustness.
- `medium`: add `batchSize: 5`, `perCallTimeoutMs: 80_000`.
- `hard`: unchanged.

Update the comment block above `TIER_SPEC` to reflect that all tiers now chunk into 2×5 sub-calls per attempt.

## Why this is safe within the global budget

- Per-tier worst case stays well under `GLOBAL_DEADLINE_MS = 130_000`: 2 chunks × ~35s typical + retry headroom is comfortably below 80s per attempt, × `maxAttempts = 2` ≈ 160s upper bound — but tiers run in parallel (see `Promise.all` orchestration), so the global wall clock is dominated by the slowest tier, not the sum.
- `callGateway` already handles partial chunk failure: if chunk 2 fails after chunk 1 succeeds, the 5 candidates from chunk 1 are returned and the outer `runTier` loop can retry just the remainder on the next attempt.
- `perCallTimeoutMs` is an upper bound — `callGatewaySingle` line 712 still clamps to remaining global budget, so we won't blow the 130s deadline.

## Out of scope

- No prompt or validation changes — failure mode is timeout, not rejection.
- No changes to `GLOBAL_DEADLINE_MS`, `GATEWAY_CALL_TIMEOUT_MS`, retry counts, or the `runTier` orchestrator.
- No UI changes; the "Generation incomplete" banner already surfaces the right message when a tier under-delivers.

## Verification

1. Open `/teacher/setup/diagnostic`, click **Regenerate standard**, confirm it reaches 10/10.
2. Click full regeneration, confirm all four tiers reach 10/10.
3. Check `diagnostic_generation_events` for the run: standard should show two `gateway_response` events per attempt (one per 5-Q chunk) instead of one.
