# Fix `generate-weekly-quiz` server timeouts

## Diagnosis (from logs + code)

Recent invocation timeline:
- `standard` sub-call **timed out at 45s on attempts 2 and 3** (`Signal timed out.`)
- Then **every backfill tier was skipped**: "deadline budget too low"
- Function shutdown ~200s after boot — global deadline was blown

Root causes in `supabase/functions/generate-weekly-quiz/index.ts`:

1. **Model is `google/gemini-2.5-pro`** (line 108). Pro is a thinking model; with a heavy system prompt (~200 lines with existing-questions + cross-tier lists + rules), P95 latency easily exceeds 45s per call. Other question generators use `flash` / `flash-lite` for exactly this reason.
2. **Standard tier runs strictly before adaptive tiers** (lines 653–669 sequential; adaptive `Promise.allSettled` at 671 only starts after `await`). If standard burns its full budget (3 × 45s = 135s > `GLOBAL_DEADLINE_MS = 130s`), adaptive tiers start with **zero** budget and their per-call `AbortSignal.timeout(45_000)` fires immediately or their loops exit on the deadline check.
3. **Per-call `AbortSignal.timeout` is a fixed constant**, not clamped to remaining deadline. A sub-call spawned near the deadline still waits its full 45–60s, wasting budget and returning after global shutdown.
4. **Backfill guard requires ≥25s of remaining budget** (line 746). Given (1)+(2), this is almost never satisfied → all four backfills skipped, tiers ship short.
5. Standard was serialised specifically to feed itself as `crossTierAvoid` into adaptive tiers. That safeguard is redundant — the post-assembly cross-tier dedup (lines 719–732) already catches overlap.

## Fix (single file: `supabase/functions/generate-weekly-quiz/index.ts`)

### 1. Faster model + tighter tier specs
- `MODEL = "google/gemini-2.5-flash"` (drop pro).
- `TIER_SPEC` per tier:
  - `perCallTimeoutMs`: **25_000** for standard/easy/medium, **30_000** for hard.
  - `maxAttempts`: **2** for all tiers (was 3–4). With flash and small batches, first attempt usually succeeds; a second attempt is enough retry.
  - `batchSize` unchanged (3).

### 2. Deadline-aware per-call timeout
Introduce a helper used at every gateway fetch:
```
const timeoutMs = Math.max(4_000, Math.min(spec.perCallTimeoutMs, deadlineAt - Date.now() - 2_000));
if (timeoutMs <= 4_000 && Date.now() + 4_000 >= deadlineAt) break outer;
signal: AbortSignal.timeout(timeoutMs)
```
So a sub-call never outlives the global deadline and never wastes 45s when only 10s remain.

### 3. Run all tiers in parallel from the start
Replace the sequential `standard → adaptive` block (lines 652–696) with a single `Promise.allSettled([standard, easy, medium, hard])`. Pass `crossTierAvoid = []` to every tier at generation time; rely on the existing post-assembly cross-tier dedup (lines 719–732) to remove overlaps by tier priority (`standard → hard → medium → easy`).

Net effect: worst-case wall-clock ≈ `max(tier durations)` instead of `standard duration + max(adaptive durations)`.

### 4. Shrink backfill guard + prompt overhead
- Lower backfill deadline guard from `< 25_000` to `< 12_000` (line 746). With flash + `maxAttempts=1` + `batchSize` capped to `shortfall`, a backfill call completes well under 12s.
- Trim `SAME_TIER_PROMPT_CAP` and `CROSS_TIER_PROMPT_CAP` from 16 → **8**. Prompt size directly drives TTFT on flash; existing questions past ~8 rarely change dedup outcomes because `dedupWithin` still runs server-side.

### 5. Preserve current behaviour
- No schema/DB changes.
- Validator wiring, quota audit, skew handling, top-up backfill, insert step, and response shape stay identical.
- `GLOBAL_DEADLINE_MS = 130_000` unchanged (edge cap ~150s).

## Expected outcome
- Standard tier typically finishes in ~10–20s instead of timing out at 45s×N.
- All four tiers execute concurrently, so total generation completes in ~25–40s on the happy path.
- Backfill guard is reachable, so short tiers get topped up instead of shipping partial.
- If flash occasionally drops a question, per-tier `maxAttempts=2` + backfill still fill the quota within budget.

## Out of scope
- No changes to `_shared/question-validation.ts`.
- No changes to any other edge function.
- No client-side changes.
