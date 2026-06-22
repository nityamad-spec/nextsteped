## Root cause

In `supabase/functions/generate-exam-questions/index.ts`, `generateBatch` can return fewer than `batch.count` questions even though the orchestrator treats whatever it returns as final. With `total=30` and `BATCH_SIZE=5` you get 6 parallel batches; if any single batch comes back one short, the exam ends with 29 instead of 30. Three independent silent-drop paths exist:

1. **Position-skew rebalancer drops without guaranteed refill** (lines 323–347). After the batch hits `accepted.length >= batch.count`, the check may `splice` out 1–2 MCQs whose correct option clusters at one index. The outer `for` loop condition is rechecked, so a retry is attempted — but if it's already the last attempt (`attempt === MAX_ATTEMPTS-1`), or the retry returns only dupes/invalid items, the batch returns `batch.count − dropped`. With 5 per batch the rebalancer removes 1 whenever 3+ correct answers share an index (very common at temperature 0.35), so the "29/30" symptom is the expected failure mode.
2. **Duplicate dedup is silent** (line 316). When two generated questions share the first 120 chars, the second is skipped without being added to `rejects`, so `retryHint` is not updated and the next attempt has no signal to diversify. Combined with `arr.length === need`, the batch can short itself by 1 per attempt.
3. **No over-generation buffer.** Unlike `generate-diagnostic-questions` (which asks for `subNeed + 1`), exam batches ask for exactly `need`, so any single rejection/dup/skew-drop forces a full retry round-trip and risks running out of attempts.

There is also no orchestrator-level salvage: `Promise.all` over 6 batches means one short batch silently yields `generated = 29`; the SSE `done` event reports `generated: 29` with no warning, and the client UI shows the requested 30.

## Fix

Mirror the partial-generation pattern already used in `generate-diagnostic-questions` and `generate-weekly-quiz`, scoped to the exam generator only.

### 1. `generateBatch` changes (lines 208–355)
- **Over-generate**: request `need + 1` from the model on every attempt (cap to `batch.count + 2` total accepted), so one rejection/dup does not force a retry.
- **Make skew-rebalancer attempt-aware**: skip the splice on the final attempt; on earlier attempts, after splicing, immediately continue the loop with a strong `retryHint` rather than relying on the loop condition.
- **Account for dedup in retryHint**: when a question is dropped as a duplicate, push a `"duplicate stem"` reason into `rejects` so the model is told to diversify.
- **Bump `MAX_ATTEMPTS` from 3 → 4** for exam batches only; the cost is small (1 extra call at most, and only when short).
- **Return partial when non-zero**: keep current behavior (throw only if `accepted.length === 0`), but also return the actual count so the orchestrator can react.

### 2. Orchestrator changes (lines 457–465)
- Replace `Promise.all` with `Promise.allSettled` so a single failed batch doesn't abort the whole exam.
- After all batches settle, compute `shortfall = totalQuestions − results.length`. If `shortfall > 0`, run **one top-up batch** that requests exactly the missing count, distributed across the concepts/difficulties that came up short (reuse `hamilton` on the residual `perConcept` and residual `difficulty`).
- Keep emitting `progress` events; emit a new `progress` event after the top-up.
- In the final `done` event, include `requested: totalQuestions` and `partial: results.length < totalQuestions` so the client can show a warning if even the top-up couldn't close the gap.

### 3. Client surface (out of scope unless gap remains)
No UI change required if the top-up closes the gap. If `partial: true` is ever returned, a future change to `ExamMode.tsx` can show a toast — flagged for follow-up, not done in this plan.

## Verification

1. Regenerate an AI final with `total_questions = 30` on the same course that produced 29; confirm `done.generated === 30`.
2. Repeat 3 times to cover the skew-rebalancer code path.
3. Spot-check that correct-answer index distribution across the 30 MCQs is not heavily skewed to one position (the rebalancer's original intent must still hold).
4. Run with `total_questions = 50` (10 batches) to confirm the top-up handles multi-batch shortfalls.

## Out of scope

- Prompt rewording, validator rule changes, temperature changes.
- Weekly quiz and diagnostic generators (already migrated).
- Client-side toast/UX for `partial: true` (separate follow-up).
- Logging to `ai_gateway_call_log` (separate observability task).
