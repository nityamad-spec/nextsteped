# Phase 7 — Tests

Add targeted tests at four layers. All new tests are additive; no production code changes.

## 1. Validator tests — `supabase/functions/_shared/question-validation_test.ts`

Extend the existing Deno test file:

- **Reasoning novelty rejection**: fixture where the follow-up stem is a near-duplicate of the parent stem (paraphrase / trivial rewording). Assert `validateReasoningNovelty(parent, followup)` returns a rejection with a novelty-related reason.
- **Reasoning novelty acceptance**: fixture where the follow-up asks "why" the parent's answer holds (different stem, mechanism-focused). Assert it passes.
- **Distractor plausibility (best-effort)**: fixture where a reasoning follow-up ships obviously-throwaway distractors (e.g. empty, single-char, or duplicated correct-answer text). Assert whichever existing check catches these (option-parity / structural) rejects it. Document in a comment that deeper "plausible misconception" quality is model-graded, not validator-graded — this test pins only what the validator can mechanically enforce.

## 2. Generator tests — new `supabase/functions/generate-weekly-quiz/index_test.ts`

No such test file exists today, so this is a new Deno test module. Approach: extract the follow-up sub-pass orchestration into a testable seam if it isn't already exported, then drive it with a stubbed model client.

Cases:
- **Two-strike validation → drop + backfill**: stub the model so a Bloom-3+ primary's follow-up fails validation on both retry passes. Assert the primary is removed from the shipped set and replaced from the tier's reserve pool. Assert `followup_failed_dropped` increments and no demotion occurs (Phase 2 constraint: cap demotions at 1 per tier, prefer drop-and-backfill).
- **Coverage invariant**: after a full simulated run mixing Bloom-1/2/3/4 items with some follow-up failures, assert every shipped question with `bloom_level >= 3` and `question_role === 'primary'` has a matching `question_role === 'reasoning'` row with `parent_question_id` pointing to it.
- **Emitted counts**: assert the NDJSON summary (or returned counters) include `followup_generated`, `followup_failed_dropped`, and backfill counts with correct values for the scripted scenario.
- **Budget exhaustion**: stub `remainingBudget` so the follow-up sub-pass is skipped for a tier. Assert affected Bloom-3+ primaries are dropped-and-backfilled (or, if backfill is exhausted, absent) — never shipped as bare Bloom-3+ primaries.

Risk: if the sub-pass isn't currently exported, we'll need a small refactor to expose it for testing. Flag this — it's the only place Phase 7 might touch production code.

## 3. Dialog tests — extend `src/components/WeeklyQuizDialog.test.tsx`

Uses existing Vitest + Testing Library setup. Mock the Supabase client to return a scripted primary + reasoning pair.

Cases:
- **Follow-up gated on correctness**: Bloom-3 primary with a follow-up. Answer correctly → assert the follow-up MCQ appears inline. Reset / answer incorrectly → assert the follow-up never renders.
- **Required (Next locked)**: after correct primary, assert the Next button is disabled until the follow-up is answered.
- **Inline teaching moment**: after answering the follow-up, assert the correct-reason text and explanation render before Next unlocks.
- **Payload shape**: intercept the `insert` call to `assessment_results`. Assert `answers[0]` contains `reasoning_question_id`, `reasoning_selected`, `reasoning_correct`, `reasoning_is_correct`, `reasoning_bloom` with the expected values for a boost path and a penalty path.
- **Defensive gap**: simulate a follow-up fetch failure (missing from `followupsByParentId` despite `parent_question_id` existing, or a thrown error path). Assert Next unlocks normally and the submitted `reasoning_is_correct` is `null`.

## 4. Mastery tests — extend `supabase/functions/update-mastery/mastery_test.ts`

The existing file already covers primary-only math. Add / update:

- **Boost**: primary correct + `reasoning_correct = true` → aggregated `rawSignal` strictly greater than the same primary alone.
- **Penalty**: primary correct + `reasoning_correct = false` → `rawSignal` strictly less than primary alone.
- **Floor**: primary correct + `reasoning_correct = false` → `rawSignal` ≥ primary-wrong contribution for the same item (guaranteed by construction; assert numerically).
- **Ignored on wrong primary**: primary wrong + any `reasoning_correct` value → identical to primary-wrong baseline.
- **Null-safe**: `reasoning_correct = null` or field absent → identical to primary-only baseline (no boost, no penalty).
- **Asymmetry**: for the same item at the same difficulty/bloom, |boost delta| > |penalty delta| (R=0.5 vs P=0.25).

Any pre-existing test asserting "primary correct + reasoning wrong = no penalty" is deleted or flipped, since Phase 5 changed that behaviour.

## Risks & constraints

- **Testable seam in generate-weekly-quiz**: the follow-up sub-pass may need a small export/refactor to be driven by tests without hitting the real model. If so, this is the only production code touched in Phase 7; keep it a pure move.
- **Model stubbing**: generator tests must stub the AI gateway call — real calls would be flaky and burn credits. Use dependency injection or module-level mocking consistent with existing edge-function tests.
- **Vitest mock of Supabase client**: the existing `WeeklyQuizDialog.test.tsx` already mocks it; extend the same pattern rather than introducing a second mocking strategy.
- **Deterministic numerics**: mastery tests should assert relative inequalities (boost > baseline, penalty < baseline, |boost| > |penalty|) rather than pinning exact floats, so future tuning of R/P doesn't break them — except one pinned case that locks in current R/P as a regression guard.

## Questions

1. Is a small refactor to expose the follow-up sub-pass for testing acceptable, or would you prefer black-box tests that invoke the full HTTP handler with a stubbed fetch? (Black-box is more faithful but slower and more fragile.)
2. For mastery tests, do you want one pinned-numeric regression test at current R=0.5 / P=0.25, or all-relative assertions only?
