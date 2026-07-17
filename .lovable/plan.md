
# Step 3 review — `generate-weekly-quiz` validation & retry

## What step 3 actually does today

Step 3 lives inside `generateTier()` (lines ~428-648). For each tier (standard/easy/medium/hard) it runs an outer **attempt** loop (`maxAttempts`) and an inner **sub-call** loop that chunks the tier into small batches (`batchSize=3`, `askFor = batchSize+1` over-generation buffer).

Per sub-call it:

1. Builds a system prompt including: tier spec, week concept list, strict formatting rules, obviousness rules, existing accepted same-tier items (`formatExistingQuestionsForPrompt`), cross-tier avoid list (standard-tier questions for adaptive tiers), and a `retryHint` from the previous failure.
2. Calls Lovable AI Gateway (`google/gemini-2.5-pro`) via forced tool-call `submit_questions`, with per-call `AbortSignal.timeout` and a global deadline guard.
3. Handles transport failures: sets `retryHint` and either `break`s to next attempt (timeout / 429 / non-2xx) or `continue`s (missing tool call / bad JSON). 402 throws `CreditsExhaustedError`.
4. For each returned candidate runs, in order:
   - `validateQuestion` — local structural validator (format, 4 MCQ options, length parity, longest-option cue, answer∈options, topic∈week concepts, difficulty coerced, bloom 1-4, non-empty explanation).
   - `explanationSupportsAnswer` — local semantic explanation check (T/F contradiction; MCQ key-term overlap; distractor-support check).
   - `isLikelyDuplicateQuestion` against `accepted` (same-tier) and `crossTierAvoid`.
   - Also calls `sharedValidateExplanation` from `_shared/question-validation.ts` but **only keeps the rejection if the reason matches `/names option/`** — every other shared-validator reason is silently ignored (line 318).
5. After a sub-call, updates `retryHint` from up to 3 rejection reasons.
6. **When the tier hits `count`**, runs a post-batch position-skew check (removes items whose correct-option index is over-represented >50%) and a final `validateTierQuestionSet` pass (dedup + `explanationSupportsAnswer` + the same narrow `sharedValidateExplanation` check). Removals set a new `retryHint` and the loop keeps going.
7. Returns whatever survived — the tier can ship partial.

## Issues found

**A. Two parallel validators that partially disagree.**
`_shared/question-validation.ts` already has `validateStructural`, `normalizeAnswer`, `validateOptionParity`, `validateConcept`, `validateBloom`, `validateDifficulty`, `validateExplanation`, `dedupWithin`, `auditBatchQuotas`, `summarizeRejections`. The weekly-quiz file re-implements most of this locally (`validateQuestion`, `explanationSupportsAnswer`, `tokenize`, `jaccardSimilarity`, `isLikelyDuplicateQuestion`, `validateTierQuestionSet`) and only borrows the shared explanation check for one narrow reason substring. This is the source of most of the other bugs below.

**B. Silent answer coercion never happens.**
Local `validateQuestion` requires `options.includes(answer)` verbatim. Shared `normalizeAnswer` recovers letter answers ("B"), prefix-stripped ("A) foo"), and Jaccard-nearest — so weekly-quiz drops questions the diagnostic/practice generators would keep, wasting attempts.

**C. Bloom/difficulty consistency not enforced.**
Local validator accepts bloom 1-4 in isolation. Shared `validateBloom({ enforceDifficultyConsistency: true, difficulty })` rejects "hard tier with bloom 1" and "easy tier with bloom 4" — exactly the failure mode the hard-tier prompt tries to prevent in words. Same for `validateDifficulty({ midpoint: spec.difficulty, band: 0.15 })` — today difficulty is silently clamped to [0,1] and the ±0.15 rule from the prompt is unenforced.

**D. `sharedValidateExplanation` result is filtered too aggressively.**
Line 318 keeps only reasons matching `/names option/`. That drops legitimate rejections the shared checker adds (empty/too short, T/F contradiction, MCQ token overlap, distractor support) — but the local `explanationSupportsAnswer` also runs, so they are covered *only* for reasons the local one implements. Any future improvement in the shared validator is dead code here.

**E. Retry hints don't summarize well.**
`retryHint` is built as `rejects.slice(0, 3).join("; ")` including raw text like `topic 'x' not in week concepts`. Shared `summarizeRejections` groups by reason class ("3× topic not in week concepts; 2× answer not in options") which is what the model actually needs to change behavior. Also, `retryHint` is a single string that gets overwritten each sub-call; earlier rejection classes from the same attempt are lost.

**F. Quota audit is per-tier count only, not per-concept.**
Prompt says "distribute across concepts" but nothing enforces it. Shared `auditBatchQuotas({ perConcept })` exists precisely to flag "you owe 2 more on concept X" and could feed a targeted top-up sub-call. Today an entire tier can pile onto one concept and pass.

**G. Position-skew fix creates infinite-hint loops.**
When the skew check removes items at line 622-628, `accepted.length` drops below `spec.count` and the `while` loop restarts a sub-call — but the removed slots are *always at the same skewed index*, and the model has no memory of which position was over-represented across attempts, only within a single sub-call. Combined with `spec.maxAttempts=3`, a persistently biased model can burn all attempts. This should also count against the deadline more aggressively and should feed the shared prompt template.

**H. Final tier check inside the inner while loop is duplicated.**
`validateTierQuestionSet(accepted)` runs on every successful full-tier check *and* again after the outer loop (line 642). If it removes items, the inner loop restarts — but the outer attempt counter isn't incremented, so a pathological model that always fails final dedup can loop until the global deadline instead of `maxAttempts`.

**I. No shortfall backfill call.**
When the tier ends short, `generateTier` just returns partial. There's no dedicated "top-up" sub-call restricted to the specific concepts/difficulty buckets that are short — the retry just re-asks for the tier at large.

**J. `crossTierAvoid` grows unbounded conceptually.**
For the hard tier, `crossTierAvoid` includes standard-tier accepted items (12 max in the prompt). That's fine, but the dedup check `crossTierAvoid.find(isLikelyDuplicateQuestion)` walks the full list per candidate; the prompt sees only 12 but validation could reject a candidate that duplicates item #13. Bound both consistently.

**K. Transport-error retry doesn't back off.**
On 429 or timeout, the code sets `retryHint` and `break`s to the next attempt with zero delay. Adjacent attempts can hit the same rate limit immediately.

## Proposed improvements

### 1. Adopt the shared validators end-to-end
Replace the local `validateQuestion` with a composition of:
- `validateStructural({ allowedFormats: ["mcq","true_false"], requireFourOptions: true, maxContentChars: 600 })`
- `normalizeAnswer(raw, options)` (enables letter/prefix recovery)
- `validateOptionParity(options, answer)`
- `validateConcept(topic, conceptByCode)`
- `validateBloom(raw, { min: 1, max: 4, enforceDifficultyConsistency: true, difficulty: spec.difficulty })`
- `validateDifficulty(raw, { midpoint: spec.difficulty, band: 0.15 })`
- `validateExplanation({ format, options, answer, explanation })` (keep **all** reasons; drop the `/names option/` filter)

Delete the local `tokenize`, `jaccardSimilarity`, `containmentSimilarity`, `topAnswerTokens`, `explanationSupportsAnswer`, `isLikelyDuplicateQuestion`, `questionSimilarity`, `normalizedQuestionKey`, `validateQuestion`, `validateTierQuestionSet` — use `dedupWithin` for dedup and let the shared module own the semantic checks.

### 2. Better retry hints
Use `summarizeRejections(reasons)` instead of joining the first 3. Accumulate reasons across sub-calls within one attempt so the model sees the aggregated class of failures. Cap the hint at ~300 chars.

### 3. Enforce per-concept distribution
After each sub-call, call `auditBatchQuotas(accepted, { perConcept })` where `perConcept` is `Math.ceil(spec.count / numConcepts)` per code (with any remainder distributed). If a concept is short and another is over quota, drop the over-quota surplus back to buffer and append `retryHint`: "You still owe N on concept X, M on concept Y." The next sub-call's system prompt should list only the still-short concepts.

### 4. Break the position-skew / final-dedup loops
- Count the skew fix and the final `dedupWithin` rejections against `attempt` (either bump `attempt` when they force a re-fill, or cap the total sub-calls per tier separately). Prevents the outer loop from being bypassed.
- When the position skew triggers, add an explicit instruction to the *next* sub-call system prompt naming the over-represented index, not just as `retryHint`.

### 5. Add jittered backoff on transient failures
On 429 / timeout / 5xx, `await new Promise(r => setTimeout(r, 400 + Math.random()*600))` before continuing (bounded so it never blows the deadline; skip if `Date.now() + backoff >= deadlineAt`).

### 6. Symmetric cross-tier / same-tier caps
Cap both the prompt list and the dedup set at the same N (say 16), or dedup against the full accepted set for both — but be consistent so validation doesn't reject things the prompt never warned about.

### 7. Backfill sub-call for shortfalls
If the tier ends short after `maxAttempts`, run one narrow top-up: rebuild the prompt with only the concepts the audit says are short, ask for exactly the missing count, one attempt, tight timeout. Deadline permitting.

### 8. Keep the local tier orchestration as-is
Do **not** change `TIER_SPEC`, the outer `Deno.serve` handler, DB reads, insert step (step 4), or the tier sequencing (standard first, then easy/medium/hard). This plan is scoped strictly to the validation + retry logic inside `generateTier` and its helpers.

## Files to change

- `supabase/functions/generate-weekly-quiz/index.ts` — replace local validation/dedup helpers with shared-validator composition; rewrite `generateTier`'s per-sub-call validation loop, retry-hint aggregation, quota audit, skew handling, and backoff; add top-up call.
- No changes to `_shared/question-validation.ts` (its API already covers everything needed).
- No DB migrations, no other edge functions, no frontend.

## Out of scope

- Prompt copy changes beyond wiring in aggregated hints and shortfall concepts.
- Changing model, tier counts, `batchSize`, deadlines, or the caller (`Deno.serve`) contract.
- Applying the same refactor to `generate-diagnostic-questions` / `generate-practice-questions` (mention only; separate task).
