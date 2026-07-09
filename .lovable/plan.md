# Fix: Practice question marks correct answer as wrong

## Root cause
In `supabase/functions/generate-practice-questions/index.ts`, the MCQ answer-matching block does:

```ts
if (!options.includes(answer)) {
  const letter = answer.match(/^[A-Da-d]$/)?.[0];  // only bare "A"/"B"/"C"/"D"
  if (letter) { ... }
  if (!options.includes(answer)) answer = options[0];  // silent wrong fallback
}
```

When the LLM returns an `answer` that doesn't verbatim match an option — very common cases include `"B) A neural network trained on..."`, `"A neural network trained on ... language"` (missing trailing period), curly quotes, extra whitespace, or different casing — the code silently sets `answer = options[0]`. The explanation still describes the true correct option, so the UI shows an incoherent state: "Correct answer: <option 1>" with an explanation defending option 2. That's the bug in the screenshot.

The `letter` regex is also too strict: it only catches a lone `"A"`/`"B"`, not the common `"B)"`, `"B."`, `"(B)"`, or `"B) full option text"` formats.

## Fix

Replace the fragile match/fallback with a robust matcher, and drop the question rather than guess when nothing matches.

In the MCQ branch (around lines 535-547):

1. Try a normalized compare against each option: strip leading letter prefixes (`^\s*\(?[A-Da-d]\)?[\.\):\-\s]+`), collapse whitespace, normalize quotes, strip trailing punctuation, lowercase — then compare against options normalized the same way. If exactly one option matches, set `answer` to that option's original string.
2. If still no match, also try "answer is a prefix/suffix of option (normalized)" and "option is a prefix of answer (normalized)" to catch the "B) full option text" case and truncated model output.
3. If still no unique match, **return null for that question** (drop it) instead of silently picking `options[0]`. The existing `.filter(...)` will remove it, and if `sanitized.length === 0`, the caller already handles that.
4. Add a `console.warn` with the raw answer + options when we drop, so we can spot pattern issues in edge function logs.

No client-side change needed. `PracticeQuestionsWidget` already does exact string compare `userAnswer === q.answer`, which is correct once `q.answer` is guaranteed to equal one of the option strings.

## Files touched
- `supabase/functions/generate-practice-questions/index.ts` — replace the MCQ answer-reconciliation block (~15 lines) with the normalized matcher; add a small `normalizeForMatch(s)` helper near the other helpers.

## Verification
- Deploy the edge function and re-run practice on the same prompt ("Fundamentals of LLMs"). The mis-labeled question should either come back with the correct option marked correct, or be dropped from the set (never present with a wrong "correct" label).
- Check edge function logs for any new "dropped question" warnings to gauge how often the LLM produces unmatched answers — if frequent, we can tighten the generator prompt to require verbatim option strings in `answer`.

## Out of scope
- Prompt engineering changes to the Stage 2 generator (can follow up if drops are frequent).
- Any UI change in `PracticeQuestionsWidget.tsx`.
