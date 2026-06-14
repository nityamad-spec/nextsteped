
# Fix: hard-tier diagnostic regeneration keeps failing

## Diagnosis (from `diagnostic_generation_runs` history)

Hard tier fails in two ways:

- **`deadline`** (recent tier-only regens): `GLOBAL_DEADLINE_MS = 130s` but worst-case hard run is `maxAttempts(3) × GATEWAY_RETRIES(2) × GATEWAY_CALL_TIMEOUT_MS(35s) = 210s`. Attempts 2-3 get cut off mid-call.
- **`incomplete`** (initial full runs): flash mislabels difficulty/bloom; per-batch validation drops most questions; 3 attempts not enough.
- **No accumulation across regens**: only tiers that hit `accepted === requested` are inserted, so a regen that produced 6/10 hard questions is discarded — the next regen restarts from zero. The teacher can never "fill up" hard incrementally.

## Proposed fixes (layered — apply 1+2+3 together; 4/5 are optional escalations)

### 1. Persist partial hard accepts and seed next regen from them

- After `runTier`, also insert tiers where `0 < accepted < requested` (currently dropped). Keep `tier` column scoped so subsequent regens replace just that tier's existing rows for *that* run.
- On regen, before calling `runTier`, **load existing accepted questions for the requested tier** from `diagnostic_questions` and pre-populate `accepted[]` / `acceptedByCode` so the model is only asked for the remainder. Adjust `quota` so per-concept caps subtract what's already in the bank.
- Net effect: clicking "Regenerate hard" two or three times incrementally fills the tier from 0 → 4 → 8 → 10 instead of always restarting.

### 2. Right-size the deadline and per-call budget for single-tier runs

- When `activeSpecs.length === 1`, raise `GLOBAL_DEADLINE_MS` to 150 s (Supabase invoke max) minus 5 s headroom = 145 s, and **drop `GATEWAY_RETRIES` from 2 → 1** inside that path so the worst case is `3 × 1 × 35s = 105s`, comfortably inside budget.
- Update `updateRunRow` deadline-check path to mark the run `failed` with `error_code: "deadline"` only if zero accepts; otherwise mark `done_partial` so the UI can show progress instead of an error toast.

### 3. Over-generate per batch and loosen one hard-tier validation rule

- Ask the gateway for `Math.ceil(needed × 1.5)` questions per hard attempt so validation losses are absorbed. Cap at 15 per call so token cost stays bounded.
- Drop the `bloom_level ≥ 3` requirement for hard tier (keep difficulty band only). Bloom is justified separately in the model output and is the main reason validated batches under-fill; difficulty + category band is sufficient signal for "hard."

### 4. (Optional) Halve hard batch size and run two sub-calls in parallel

- Split hard tier into two parallel `callGateway` invocations of `count: 5` each. Wall-clock per attempt drops to ~one gateway call, so attempts 2-3 fit easily. Merge results before validation. Only enable for hard since it's the slow path.

### 5. (Optional, last resort) Escalate model on final hard attempt

- On the final hard attempt only, switch from `google/gemini-2.5-flash` to `google/gemini-2.5-pro` for a higher-fidelity batch. Pro is 2-3× slower so this only fits if (2) and (4) above are also applied.

### Frontend (`DiagnosticQuestionsSetup.tsx`)

- When response says `partial: true` but `accepted > 0` for the requested tier, change toast from destructive "Generation incomplete" to amber "Topped up X/10 hard — click Regenerate hard again to fill the rest." Suppress the red "Some tiers fell short" message entirely once at least one question was added.
- Add a small "Hard: 6/10 (incremental)" indicator next to the Regenerate hard button driven by live bank count.

## Recommended path

Ship **1 + 2 + 3** together — they address both the `deadline` and `incomplete` root causes and give the teacher an incremental top-up workflow. Hold **4** and **5** in reserve if hard still misses after this.

## Out of scope

- Switching default model project-wide.
- Migration changes (schema already supports per-tier rows + run progress).
- Reworking categorization bands beyond the hard-tier loosening above.

## Validation

1. Empty bank, click "Regenerate hard" → expect 5-8/10 inserted, toast: "Topped up — click again to finish."
2. Click again → expect 10/10, no destructive toast.
3. Run full "Regenerate all" → no tier deadline errors, all 4 tiers reach 10/10 in ≤130 s.
4. Inspect `diagnostic_generation_runs` for the last 3 runs — `error_code` should be null on hard for tier-only regens once bank is full.

## Files touched

- `supabase/functions/generate-diagnostic-questions/index.ts` — partial-tier insert, seed-from-existing, single-tier deadline/retry tuning, hard validation loosening, optional sub-batching/model escalation.
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — incremental toast wording, live "X/10" indicator on per-tier Regenerate buttons.
