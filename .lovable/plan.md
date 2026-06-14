# Fix: "Generation incomplete — hard tier 0/10"

## Root cause

Live DB row for the last run:

| tier     | status     | accepted/req | attempts | error_code |
|----------|------------|--------------|----------|------------|
| standard | validating | 10/10        | 1        | —          |
| easy     | validating | 10/10        | 1        | —          |
| medium   | done       | 10/10        | 1        | —          |
| **hard** | **failed** | **0/10**     | **2**    | **incomplete** |

Hard tier (`difficulty 0.85 ±0.15` → required band **0.70–1.00**) consistently produces zero accepted questions. Two compounding reasons in `validateMcq`:

1. **`difficulty_justification` category band is over-constrained for hard.** Only two categories overlap the required difficulty band: `EDGE_CASE` (0.60–0.80) and `COMPOSITE_REASONING` (0.75–0.95). Any model output landing at e.g. `diff=0.82, EDGE_CASE` or `diff=0.78, COMPOSITE_REASONING` near the edges is rejected. With `bloom ≥ 3` also required, the model fails the joint constraint at high rate.
2. **All-or-nothing insert.** Even though 30/40 questions were valid, the function returns 422 and **inserts nothing**, so the teacher sees an empty bank after 2 minutes of generation.

`MAX_ATTEMPTS = 2` then guarantees we stop after only 2 hard-tier batches, locking in the failure.

## Fix (three small, surgical changes)

### 1. Make the hard-tier validation band achievable
In `supabase/functions/generate-diagnostic-questions/index.ts`:

- Lower hard target from `0.85` → `0.80` and widen `DIFFICULTY_BAND` from `0.15` → `0.20` **for hard only** (keep ±0.15 for other tiers via a per-tier `band` field on `TierSpec`). Resulting hard band: 0.60–1.00 — covers `EDGE_CASE` cleanly and overlaps `COMPOSITE_REASONING` fully.
- Update the prompt's `±0.15` line to use the spec's band.

### 2. Give hard tier one more attempt
- Replace global `MAX_ATTEMPTS = 2` with a per-spec `maxAttempts` (standard/easy/medium = 2, hard = 3). Budget impact: hard still bounded by the 130s `GLOBAL_DEADLINE_MS`; each call is ≤35s, so 3 × 35s = 105s worst case for hard, well within budget (it runs in parallel with the others).

### 3. Per-tier resilient insert (no more all-or-nothing)
Replace the `allComplete` 422 gate with:

- Insert **every tier that hit its quota** (so a successful standard+easy+medium persists even if hard falls short).
- If at least one tier completed, return `200` with `{ inserted, breakdown, partial: true }`.
- Only return `422` when **zero** tiers completed.
- Client (`DiagnosticQuestionsSetup.tsx`) shows an amber "Partial bank generated — N/40 questions. Hard tier short, regenerate to top up." toast on `partial: true`, instead of the current destructive toast.

A future "regenerate just the failed tiers" button can reuse the same edge function with an optional `tiers: ["hard"]` param — out of scope here.

## Files touched

- `supabase/functions/generate-diagnostic-questions/index.ts` — `TierSpec` adds `band`/`maxAttempts`; `validateMcq` uses `spec.band`; `runTier` uses `spec.maxAttempts`; top-level handler switches to per-tier insert + partial response.
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — handle `partial: true` 200 response with a warning (not error) toast; refresh the question list on partial success.

## Out of scope

- Switching hard tier to `gemini-2.5-pro` (slower, would risk timeout).
- A "regenerate failed tiers only" UI button.
- Changing the bloom ≥ 3 constraint for hard (intentional pedagogy rule).

## Validation

After deploy, click **Generate Question Bank** once and confirm:
- Either all 40 land (ideal), or
- At least 30 land with an amber partial-success toast and the question bank populated.
- `diagnostic_generation_runs` rows show `done`/`done`/`done`/`done` or three `done` + one `failed`.
