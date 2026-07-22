## Phase 2 — Generation logic in `generate-weekly-quiz`

Extend the existing tiered generation pipeline in `supabase/functions/generate-weekly-quiz/index.ts` with a follow-up reasoning sub-pass that runs after each tier's primaries are accepted. Bloom ≥ 3 primaries get exactly one linked reasoning MCQ; Bloom 1–2 primaries stay untouched.

No DB changes (Phase 1 already added `parent_question_id` and `question_role`). No client changes yet (Phase 3+).

---

### 1. Where the sub-pass runs

Inside the existing per-tier loop, immediately after a tier's accepted primaries are finalized and inserted-in-memory (before moving to the next tier). This keeps tier isolation, keeps concept/difficulty context tight, and lets the existing wall-clock/heartbeat plumbing wrap the extra work.

### 2. Eligibility + batching

- Collect accepted primaries in the tier with `bloom_level >= 3`.
- Batch of 3 parents per model call. Same per-call timeout budget as the tier's primary call.
- Payload per parent: stem, correct answer, parent explanation, concept code, parent Bloom, tier difficulty band.

### 3. Prompt rules for the reasoning MCQ

- Format: MCQ, exactly 4 options. Same length-parity / distractor / correct-option-rotation rules as primaries.
- Must test **why** the answer holds — rule, mechanism, invariant, or edge case behind it. Must not restate/paraphrase the parent stem, and must not re-ask the same surface fact.
- Distractors must be **plausible wrong reasons** — each a specific, believable misconception. No throwaway/obvious-wrong options (a wrong reasoning answer now carries a mastery penalty in Phase 5, so weak distractors would penalise students for question quality rather than misunderstanding).
- `topic` = parent's concept code.
- `bloom_level` = parent's Bloom, or `min(parent+1, 4)`.
- `difficulty_estimate` inside the parent tier's band.

### 4. Validation

Reuse the shared validator on each follow-up:

- `validateStructural` (MCQ, 4 options, length parity)
- `validateOptionParity`
- `validateConcept` (must equal parent's concept code)
- `validateBloom` (within allowed follow-up range for this parent)
- `validateExplanation`

Plus a new local helper `validateReasoningNovelty(parent, followup)`:

- Rejects if follow-up stem is a near-duplicate of the parent stem (reuses `isLikelyDuplicate` from the shared module) or if the follow-up correct answer is a trivial paraphrase of the parent's correct answer (token Jaccard threshold).

Failing follow-ups are dropped (not silently patched), reason captured for retry hints.

### 5. Bounded retry for shortfalls

Because coverage is consequential, allow **two** retry passes (up from the usual one) for parents whose follow-up failed validation. Retries feed rejection reasons back into the prompt via the existing `summarizeRejections` hint.

### 6. Coverage rule — never ship a silent gap

If after retries a Bloom-3+ primary still lacks a valid follow-up, apply one of these deterministically (never ship the primary as-is):

- **(a) Drop + backfill:** drop the primary and pull a replacement from the tier's reserve pool of already-validated primaries not selected for the final N.
- **(b) Demote to Bloom-2:** if the primary reads sensibly as a Bloom-2 (recall/apply) standalone, rewrite its `bloom_level` to 2 and ship without a follow-up. Heuristic: item passes structural checks with the demoted Bloom via `validateBloom`.

Prefer (a) when reserve is available; fall back to (b) otherwise. If neither is possible, drop the primary entirely rather than ship an inconsistent item.

### 7. Budget gating

Gate the follow-up sub-pass on `remainingBudget > perCallTimeoutMs + 4s`. If short, **skip the sub-pass**, but every Bloom-3+ primary in that tier must then be demoted or dropped per rule 6 — they cannot ship as Bloom-3+ without their required follow-up.

### 8. Telemetry (NDJSON heartbeat channel)

Emit per-tier counts on the existing stream so gaps are visible:

- `followup_generated`
- `followup_failed_dropped`
- `followup_failed_demoted`
- `followup_skipped_budget`

Heartbeats continue firing on the same 20s cadence during the sub-pass (reuses existing keep-alive; no new stream logic).

### 9. Persistence

Follow-ups are held in memory alongside their parents through the tier loop. Final batched insert (existing code path) writes them with:

- `parent_question_id = <parent primary id>`
- `question_role = 'reasoning'`
- Same `course_id`, `mode`, `quiz_day`, `concept_id`, tier metadata as parent

Parents keep `question_role = 'primary'` (DB default).

---

### Risks / constraints

- **Extra model calls per tier.** With N Bloom-3+ primaries per tier and batch size 3, that's ~⌈N/3⌉ extra calls plus retries. Budget gating (§7) is the safety valve.
- **Reserve pool size.** Rule 6(a) only works if the primary-generation pass keeps a small overshoot. Confirm the existing pipeline already retains rejected-but-valid extras; if not, we need a tiny generation bump to build one. **Question below.**
- **Demotion heuristic (6b).** Rewriting `bloom_level` post-hoc is a data-integrity call — we're editing a model-produced label. Acceptable because it only lowers the label to match how the item will be scored (no follow-up path).
- **Phase 5 dependency.** The whole coverage-consequential framing (penalising missing follow-ups) is enforced in Phase 5 scoring. Phase 2 just guarantees the data shape Phase 5 will assume.

### Out of scope for Phase 2

- Client UI (chained delivery / gated follow-up display) — Phase 3.
- Answer capture split between primary vs reasoning — Phase 4.
- Mastery scoring changes — Phase 5.

---

### Open questions before I implement

1. **Reserve pool:**  Bump primary generation slightly (e.g., generate N+2 per tier and keep the top N, holding the rest as reserve) to make rule 6(a) reliably work? 
2. **Demotion cap:** There should be a max number of demotions per tier (e.g., ≤1) to avoid the whole tier drifting to Bloom-2
3. **Follow-up Bloom rule:** Confirm "`parent_bloom` or `parent_bloom+1` capped at 4" —  choice should be model-driven (prompt says "same or one higher, max 4"). 