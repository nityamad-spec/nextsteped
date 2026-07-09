# Fix: 10-question practice batch returns only ~4 questions

## Root cause
Edge function logs from the last run show three dropped questions with the same shape:

```
practice: dropping question, answer did not match any option
  rawAnswer: "B"
  options: ["Unimodal model","Multimodal model","Text-to-speech model","Recommendation system"]
```

The LLM is returning the answer as a bare letter ("A"/"B"/"C"/"D") instead of the verbatim option string. My previous sanitizer refactor replaced the old `^[A-Da-d]$` letter→index mapping with a normalized string-match + prefix-overlap heuristic. That heuristic can't map `"B"` to `"Multimodal model"`, so every letter-only answer now falls through to the "drop question" branch. Result: 10 requested → most dropped → widget renders whatever's left (4 in this case).

This is a regression from the previous fix, not a new LLM behavior.

## Fix

In `supabase/functions/generate-practice-questions/index.ts`, inside the MCQ answer-reconciliation block, add a letter→index mapping as the FIRST attempt before the normalized string match:

1. Strip surrounding whitespace/punctuation from `answer` and test against `^[A-Da-d]$`. If it matches, map `A→0, B→1, C→2, D→3` and, if that index exists in `options`, set `answer = options[idx]` and continue.
2. If not a bare letter, keep the current normalized-string match + prefix-overlap heuristic.
3. Only drop the question if BOTH strategies fail.

Also tighten the Stage 2 prompt to reduce the letter-answer behavior: add a one-line rule to `SYSTEM_PROMPT_GENERATE_TEMPLATE` saying `"answer" MUST be the full option string verbatim, never a letter like "A" or "B"`. Belt-and-suspenders.

## Files touched
- `supabase/functions/generate-practice-questions/index.ts`
  - Add letter→index branch inside the existing `if (!options.includes(answer)) { ... }` block (~8 lines).
  - Add one prompt line under "Item quality → MCQ" reinforcing verbatim-answer requirement.

No client change.

## Verification
- Regenerate a 10-question practice set on the same course; expect all 10 to come through.
- Check edge function logs — the "dropping question, answer did not match any option" warnings should disappear (or only appear for genuinely broken outputs, not bare letters).

## Risks

- **Letter→option index assumes generator ordering.** If the LLM ever returns options in a shuffled order that doesn't match the letter it picked, letter→index would silently pick the wrong option (the exact bug we fixed for the first screenshot). Mitigation: the sanitizer already keeps `options` in the order the LLM emitted them, so `"B"` correctly refers to `options[1]`. This is the same convention the code used before the refactor, and it worked for months. We are not shuffling options server-side.
- **Still fragile if the LLM returns something like `"Option B"` or `"b) Multimodal model"`.** The existing normalized-match branch already handles those cases and will fire when the answer isn't a bare letter. No change in that path.
- **Prompt tightening may increase retries/tokens marginally.** Negligible.
- **Batch may still shrink for other reasons** — length-parity rejections, duplicate stems, TF-shape guard. Those are intentional quality gates; if they trigger frequently we'll see it in logs and can address separately.
- **No client-side "we asked for 10 but got N" UX.** Out of scope for this fix, but worth noting: if a batch does come back short, the widget silently uses whatever came through. Follow-up option (not in this plan): show a toast like "Generated N questions" or retry once when `questions.length < intent.count * 0.7`.

## Out of scope
- Client-side retry/backfill when batches shrink.
- Broader Stage 2 prompt rewrite.
- Server-side option shuffling (would break the letter→index assumption).
