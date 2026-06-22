
## Root cause of "Edge Function returned a non-2xx status code"

`supabase/functions/generate-weekly-quiz/index.ts` does NOT follow the partial-generation pattern that `generate-diagnostic-questions` uses. Concrete gaps:

1. **No per-call chunking / partial salvage.** Each tier asks for `need` (up to 5) questions in one gateway call with `AbortSignal.timeout(300_000)`. Diagnostic splits each tier into `batchSize`-sized sub-calls (2×5) and concatenates whatever returns — a single slow chunk doesn't zero out the tier.
2. **No global deadline.** Supabase edge invoke is bounded at ~150s, but the function uses a 300s per-call timeout. Combined with the strict validator (length parity, position rotation, bloom 1–4 only, 4-distinct options, topic-in-week-concepts), rejections force re-requests of the full `need`, and 3 attempts × ~60s on flash easily blow past 150s → the platform kills the response → client sees "non-2xx".
3. **All-or-nothing parallel.** Tiers are run via `Promise.all`. One tier throwing (very common for `hard` under joint difficulty + bloom ≥ 3 constraints) aborts all 4 tiers and discards 15 already-accepted questions — the user sees the failure toast in the screenshot even when 3 of 4 tiers succeeded.
4. **No over-generation buffer.** Diagnostic asks for slightly more than `need` per batch to absorb validator rejections; weekly quiz asks for exactly `need`, so any rejection forces another full attempt.
5. **No 402 / credit-exhaustion sentinel.** Any non-OK status currently throws a generic `Error`, which surfaces as an opaque non-2xx.
6. **No structured logging** (no `ai_gateway_call_log` or run/event rows), making post-mortem of these failures impossible.

## Plan — port the diagnostic pattern into `generate-weekly-quiz/index.ts`

Scope: edge function only. No DB schema, no client UI changes, no scoring changes. Tier counts (5/5/5/5), validator rules, prompt content, and the existing position-skew check are preserved.

### 1. TierSpec + budgets
Extend `TierSpec` with `batchSize` and `perCallTimeoutMs`. New values:

| tier      | count | batchSize | perCallTimeoutMs | maxAttempts |
|-----------|-------|-----------|------------------|-------------|
| standard  | 5     | 3         | 45_000           | 2           |
| easy      | 5     | 3         | 45_000           | 2           |
| medium    | 5     | 3         | 45_000           | 2           |
| hard      | 5     | 3         | 60_000           | 3           |

Add module-level `GLOBAL_DEADLINE_MS = 130_000` and a `deadlineAt` epoch passed into `generateTier`.

### 2. Refactor `generateTier` into chunked sub-calls
- Inside each attempt, instead of one fetch for `need` questions, loop sub-calls of `Math.min(batchSize, need - accepted.length)` until the tier is full, the attempt's rejection rate is too high, or the deadline is hit.
- Each sub-call uses `AbortSignal.timeout(spec.perCallTimeoutMs)` (replace the current 300_000).
- Ask the LLM for `subNeed + 1` (small over-generation buffer) so validator rejects don't immediately force a new round-trip.
- After each sub-call, run the existing `validateQuestion` loop and append survivors to `accepted`. Partial survivors are kept across sub-calls and attempts — same shape as diagnostic.
- Keep the existing post-batch position-skew check exactly as-is (runs once `accepted.length >= spec.count`).
- On `AbortError` / `timeout` from a single sub-call, log + continue to the next sub-call/attempt instead of throwing.

### 3. Tier orchestration with partial salvage
Replace `Promise.all(...)` with `Promise.allSettled(...)`:
- For each settled tier, persist whatever `accepted` it returned (even if < `spec.count`).
- Only fail the whole request if **zero** tiers produced any questions. Otherwise write the rows and return `{ generated: N, requested: 20, tiers: { standard: 5, easy: 4, ... }, partial: true|false }`.
- Existing delete-then-insert for `mode='daily_quiz', quiz_day=weekNumber` keeps replace-semantics; partial result is still a valid weekly quiz (scoring already tolerates < 5 in a tier because `WeeklyQuizDialog` shuffles whatever it gets).

### 4. Sentinel errors + structured response
- Add `CreditsExhaustedError` (402) and `DeadlineExceededError` classes mirroring diagnostic.
- Top-level catch returns `{ error, code: 'CREDITS_EXHAUSTED' | 'DEADLINE' | 'INTERNAL' }` with status 402 / 504 / 500 so the client toast can show actionable text.

### 5. Lightweight gateway logging (optional but included)
Port the `logGatewayCall` helper from diagnostic (writes to existing `ai_gateway_call_log` table) with `purpose='weekly_quiz_tier'`. Fire-and-forget via `EdgeRuntime.waitUntil`. No new tables.

### Verification

1. Regenerate Week 1 weekly quiz from the screenshot's course and confirm 200 with 20 rows in `assessment_questions` (`mode='daily_quiz', quiz_day=1`).
2. Force a slow tier by temporarily setting `perCallTimeoutMs = 1_000` on `hard`; confirm response is 200 with `partial: true` and the other 3 tiers' rows are written.
3. Check `ai_gateway_call_log` for `function_name='generate-weekly-quiz'` entries with per-sub-call durations and outcomes.
4. Re-run the existing `WeeklyQuizDialog.test.tsx` to confirm the dialog still consumes the shape unchanged.

### Out of scope
- Validator rule changes, prompt rewording, or distractor/length-parity logic — already tuned in the previous turn.
- Client-side toast wording (handled in a later UI pass once we see structured `code` field).
- Exam generator — the same pattern should be ported later in a separate plan if needed.
