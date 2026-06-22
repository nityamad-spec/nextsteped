## Goal

Prevent the "longest option = correct" giveaway in diagnostic question generation, mirroring the guardrails already in `generate-weekly-quiz`.

## Changes (single file: `supabase/functions/generate-diagnostic-questions/index.ts`)

### 1. Add length-parity validation in `validateMcq` (around lines 306-313)

After the duplicate-options check, add:

```ts
const lens = opts.map((o) => o.length);
const maxLen = Math.max(...lens);
const minLen = Math.min(...lens);
if (minLen > 0 && maxLen / minLen > 1.6) {
  return { ok: false, reason: `option length imbalance ${minLen}->${maxLen} (>1.6x)` };
}
```

Then after the `answer` matches check (line 313), add the "strictly-longest correct" rejection:

```ts
const answerLen = answer.length;
const avgLen = lens.reduce((s, n) => s + n, 0) / 4;
const strictlyLongest = lens.filter((l) => l === maxLen).length === 1 && answerLen === maxLen;
if (strictlyLongest && answerLen > avgLen * 1.25) {
  return { ok: false, reason: "correct option is strictly longest and >25% above avg length" };
}
```

### 2. Add prompt guidance under STRICT RULES (around line 606)

Add two rules matching the weekly-quiz language:

- `LENGTH PARITY: all 4 options must be within ±20% character length of each other (max/min ≤ 1.6). The correct option must NOT be the longest or the most hedged/qualified — match the syntactic shape, specificity, and hedging level across all 4 options.`
- `ELABORATE DISTRACTORS: each wrong option must encode a specific, plausible misconception (a wrong rule, swapped operator, off-by-one, confused term) — written with the same level of detail as the correct answer. No throwaway one-word distractors against a long correct answer.`

## Risks

- **Higher rejection rate / more retries.** The diagnostic generator already runs against MAX_ATTEMPTS budgets per tier. Stricter validation could push some tiers (especially hard) closer to partial completion. Mitigated by the prompt guidance reducing bad outputs upstream; weekly quiz uses the same thresholds successfully.
- **Pre-seeded questions** (already-stored DB rows loaded at lines ~1298-1307) bypass new validation since they aren't re-checked. Acceptable — they were previously approved; we're only constraining new generation. (Flagging in case you'd like a one-time cleanup pass — out of scope here.)
- No schema or position-rotation changes; we are not touching answer-index distribution (diagnostic doesn't have weekly-quiz's position-rotation enforcement, and you didn't ask for it).

## Out of scope

- Backfilling/repairing existing diagnostic_questions rows.
- Position rotation across batches.
- Changing tier difficulty bands or attempt budgets.
