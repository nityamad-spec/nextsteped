## Add length-parity guard to `generate-practice-questions`

Port the same "correct answer must not be the longest" guard already used in `generate-diagnostic-questions` / `generate-weekly-quiz` into `supabase/functions/generate-practice-questions/index.ts`.

### Changes (single file)

1. **Prompt rule** — extend the MCQ bullet at line 203 with the length-parity instruction:
   > LENGTH PARITY: all 4 MCQ options must be within ±20% character length of each other (max/min ≤ 1.6). The correct option must NOT be the longest or the most hedged/qualified — match syntactic shape, specificity, and hedging level across all 4 options.

2. **Validator** — in the sanitize/map block (lines 527–564), after MCQ options are normalized and the answer is resolved, apply a length check that mirrors the diagnostic validator:
   - Compute option lengths.
   - Reject the MCQ (return `null`) if `max/min > 1.6`.
   - Reject if the correct option is strictly the longest AND its length exceeds the average option length by more than 25%.
   - Applies to MCQ only; True/False is unaffected.

3. **Graceful degradation** — if filtering leaves zero valid questions, the existing `sanitized.length === 0` branch already returns a 502, so no extra handling is needed. (Practice generation is a single-shot call, not a retry loop, so some user requests may return fewer than requested — acceptable trade-off, consistent with current behavior when the model returns malformed items.)

### Files touched
- `supabase/functions/generate-practice-questions/index.ts`

### Risks
- Slightly fewer questions returned per request when the model produces length-imbalanced MCQs. No retry loop exists here, so the count can drop. If this becomes a problem we can add a single regeneration retry later.