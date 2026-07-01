Plan to fix weekly quiz duplicate generation

1. Preserve the existing partial generation approach
- Keep the current chunked/top-up generation pattern per tier.
- Continue generating small batches until the tier reaches its target count.
- Keep timeout handling, partial salvage behavior, credit exhaustion handling, and existing delete-then-insert flow.

2. Pass already-generated same-tier questions into each subsequent LLM call
- For each tier, maintain the accepted questions collected so far.
- After the first sub-call in a tier, include an `EXISTING QUESTIONS IN THIS SAME TIER` block in the prompt.
- Instruct the model not to repeat, paraphrase, or ask the same underlying concept/application as any listed question.
- Include each existing question’s stem, answer, topic, and short explanation so the model can avoid both duplicate stems and duplicate answer rationale.

3. Strengthen the validator after each sub-call
- Continue validating schema, format, options, answer membership, topic, Bloom level, difficulty, option length parity, and non-empty explanation.
- Add a stricter same-tier duplicate detector using normalized stems and token similarity, not just the first 120 lowercase characters.
- Reject exact duplicates and close paraphrases such as “bias” vs “biases” or “principle” vs “intent behind the principle.”

4. Add final tier-level validation before returning generated questions
- Once a tier has its final JSON array, run a full-tier validator over all accepted questions.
- Verify no duplicate/paraphrased question pairs remain within that tier.
- Verify each explanation matches the stored correct answer:
  - For MCQ: explanation should reference the correct answer text or key terms from it.
  - For True/False: explanation should clearly support the chosen `True` or `False` answer.
- If final validation fails, remove invalid/duplicate items and continue top-up generation with those rejection reasons included in the next prompt.

5. Improve retry hints to the LLM
- When validation rejects questions, pass specific feedback into the next sub-call, including duplicate question stems and explanation/answer mismatch reasons.
- Keep the feedback compact so prompts stay within budget.

6. Verification
- Regenerate weekly quiz 11 for Introduction to Generative AI.
- Confirm the standard tier has 5 unique questions with no near-duplicate pairs.
- Confirm every generated question has a non-empty explanation aligned with its correct answer.
- Confirm the review dialog still displays all tiers correctly without frontend changes.

Files expected to change
- `supabase/functions/generate-weekly-quiz/index.ts` only.

No database schema or UI changes are needed.