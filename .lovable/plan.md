# Make weekly quiz & exam MCQs harder and non-obvious

## Problem

In both `generate-weekly-quiz` and `generate-exam-questions`, the model is told to produce 4 options but given no guidance on distractor quality or length parity. LLMs default to writing the correct answer as a fully-qualified, hedged sentence and the distractors as terse wrong labels — so the longest option is almost always correct. There's also no constraint on rotating the correct-answer position or on plausibility of distractors.

## Fix (prompt + validator changes only — no schema or UI changes)

### 1. `supabase/functions/generate-weekly-quiz/index.ts`

**Prompt additions (`generateTier`, the `STRICT RULES` block):**

- **Length parity rule:** "All 4 options must be within ±20% character length of each other. Do NOT make the correct answer the longest or most-qualified option."
- **Distractor quality rule:** "Each distractor must reflect a *specific, elaborated* misconception a student could plausibly hold — wrong-but-reasoned, not obviously absurd. Write distractors with the same syntactic structure, specificity, and hedging level as the correct answer."
- **Position rotation:** "Across the batch, distribute the correct answer's index roughly evenly across positions 0–3. No more than 2 questions in a row may share the same correct index."
- **Complexity lift:** `bloom_level` for `medium` tier is bloom 2-3 and `hard` is bloom 3-4.  Add: "Prefer scenario/code-trace/comparison stems over single-fact recall."
- Slightly lower `temperature` to 0.35 to keep adherence high.

**Validator additions (`validateQuestion`) for MCQ:**

- Compute option lengths; reject if `max(len)/min(len) > 1.6` OR if the correct option is the strictly longest AND longer than the average by >25%.
- (Keep all existing checks.)

**Post-batch check in `generateTier`:**

- After accepting `spec.count` questions, compute distribution of `options.indexOf(answer)`. If any single index holds >50% of correct answers, drop the over-represented surplus and request a top-up attempt with `retryHint = "Correct-answer position was skewed to index N — rotate positions"`.

### 2. `supabase/functions/generate-exam-questions/index.ts`

Mirror the same three prompt additions, validator length check, and post-batch position-rotation check in `generateBatch` / `validateQuestion`. Keep existing batching, difficulty mix, and concept targets untouched.

### 3. Out of scope

- No DB schema changes, no UI changes, no student-facing component edits.
- Existing tier counts, difficulty mix, and concept distribution preserved.
- `score-diagnostic` and weekly-quiz scoring unchanged (answers still match by full text).

## Verification

1. Regenerate one week's quiz for a test course; inspect rows in `assessment_questions` and confirm:
  - For each MCQ, `max(opt_len)/min(opt_len) ≤ 1.6`.
  - Correct-answer index distribution across the 20 questions is not >50% on any single index.
2. Regenerate a short exam (10 questions) and run the same two checks.
3. Spot-check 3 MCQs to confirm distractors are elaborated (not one-word wrongs against a long correct).