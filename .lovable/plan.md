# Fix hard-tier "Signal timed out" failures

## Root cause (recap)
Per-call `AbortSignal.timeout(35_000)` in `generate-diagnostic-questions/index.ts` fires before `gemini-2.5-flash` finishes the 10-question hard-tier batch. Every attempt dies at ~35 000 ms with `"Signal timed out."` Retries don't help because the limit is deterministic.

## Changes

### 1. Per-tier timeout (instead of one global 35 s cap)
In `supabase/functions/generate-diagnostic-questions/index.ts`:
- Replace the constant `GATEWAY_CALL_TIMEOUT_MS = 35_000` with a per-tier resolver:
  - `easy / medium / standard`: 35 000 ms (unchanged — already succeed)
  - `hard`: 80 000 ms
- Update the comment block (lines 119–125) so the worst-case math still fits inside `GLOBAL_DEADLINE_MS = 130_000`:
  - Hard regen: 1 outer attempt × 1 in-call retry × 80 s = 80 s ✓
  - Full run (4 tiers parallel): hard dominates at ≤ 80 s + DB writes ✓

### 2. Batch the hard tier into 2×5 instead of 1×10
Hard tier's joint constraints (difficulty 0.60–1.00 + bloom ≥ 3 + category band) make 10-at-once both slow and reject-prone. Splitting halves per-call latency and improves accept rate.

- Add a `batchSize` field to `TierSpec` (default = `count`, hard = `5`).
- In the tier loop (around lines 600–780, function that calls `callGateway`), when `spec.batchSize < spec.count`, issue `Math.ceil(needed / batchSize)` sequential calls per attempt instead of one, accumulating accepted questions until `needed` is met or the attempt budget runs out.
- Each sub-call still uses the per-tier timeout (80 s for hard) and is logged as its own `gateway_response` event so the audit dashboard shows the breakdown.

### 3. No schema / UI changes
- `diagnostic_generation_events` already records `attempt`, `tier`, `duration_ms`, and `data` JSON — sub-batches just appear as additional rows under the same attempt.
- Admin Diagnostic Runs page renders them automatically; no edits needed.

## Out of scope
- Switching models (kept on `gemini-2.5-flash`).
- Queue/background-worker refactor (overkill — single tier now fits comfortably under the 150 s invoke limit).
- Streaming responses.

## Validation
1. Trigger "Regenerate hard" on `/teacher/setup/diagnostic`.
2. Open `/admin/diagnostic-runs`, select the new run, confirm:
   - Two `gateway_response` events per attempt with `status: ok` and `duration_ms` ~30–50 s each.
   - `tier_complete` for `hard` with `accepted = 10`.
3. Re-run a full generation and confirm all four tiers complete; total wall-clock < 130 s.
4. If the gateway is genuinely slow that minute, the run should still degrade gracefully — `tier_partial` with `accepted` between 0 and 10 (no more "Signal timed out" at exactly 35 s).

## Files
- `supabase/functions/generate-diagnostic-questions/index.ts` — only file changed.