# Tier-wise regeneration for incomplete diagnostic tiers

## Goal

After the initial "Generate Question Bank" run produces a partial bank (e.g. standard/easy/medium done, hard short), let the teacher top up only the short tiers without re-running the tiers that already succeeded — and without wiping the existing questions.

## UX

On the Diagnostic Questions Setup page, when the response comes back with `partial: true` (or whenever a tier has fewer than its requested count of questions in the bank), render a small **"Regenerate short tiers"** action next to each short tier in the partial-success toast and in the tier section header:

```text
Hard tier — 0/10 questions   [Regenerate hard tier]
Medium tier — 8/10 questions [Regenerate medium tier]
```

Plus a single **"Regenerate all short tiers"** button that fires one call covering every short tier in parallel (same edge function, one invocation).

While regenerating:
- Disable the affected tier's button, show the existing live `diagnostic_generation_runs` progress UI scoped to those tiers only.
- Other tiers' existing questions stay visible and untouched.

On success: toast `"Hard tier topped up: 10/10"`. On another partial: same UI re-appears for whatever is still short.

## Edge function change (`generate-diagnostic-questions/index.ts`)

Add an optional `tiers?: ("standard"|"easy"|"medium"|"hard")[]` field to the request body. Behavior:

1. **Filter `TIER_SPEC`** to only the requested tiers (default: all four, unchanged).
2. **Seed `diagnostic_generation_runs`** rows only for the filtered tiers — the per-tier polling UI keeps working.
3. **Run `runTier` in parallel** for the filtered tiers only.
4. **Targeted delete + insert** instead of the current `delete WHERE course_id = X` blanket wipe:
   - For each tier that completed its quota in this run, delete existing rows where `course_id = X AND tier = <tier>`, then insert the new rows for that tier.
   - Tiers not in the request are left alone entirely.
   - Use a single transaction-ish pattern: delete-then-insert per tier inside the loop; if an insert fails, log and continue with other tiers (matches today's resilience model).
5. **Response shape unchanged** — `partial`, `shortTiers`, `breakdown`, `runId`. `partial` is computed against the *requested* tiers only, so a successful hard-only top-up returns `partial: false`.
6. **Item code counter** — keep the existing `${course_code}-${TIER}-${NNN}` numbering but restart the counter per tier (already effectively per-tier since codes embed the tier name; just confirm no collisions by including tier in the prefix, which it already does).

The deadline (`GLOBAL_DEADLINE_MS = 130s`) and per-tier attempt budgets are unchanged. A single-tier call has far more budget headroom, which is the whole point — hard's 3 attempts × 35s fits comfortably.

## Frontend change (`DiagnosticQuestionsSetup.tsx`)

1. **Compute short tiers from the live bank** (not just the last response): `shortByTier[t] = TIER_SPEC[t].count - currentCountInBank[t]`. This drives the "Regenerate X tier" buttons so they appear even after a page reload.
2. **Add `handleRegenerateTiers(tiers: string[])`** — mirrors `handleGenerate` but passes `{ courseId, tiers }`, and only refetches/updates UI for those tiers. Re-uses the existing toast logic and `diagnostic_generation_runs` poller (which already keys off `runId`).
3. **Tier section header** gets a `Regenerate` button when `acceptedInBank < requested`.
4. **Partial-success toast** gains an inline `Regenerate short tiers` action that calls `handleRegenerateTiers(data.shortTiers)`.
5. **Step-completion gate** (`markStepCompleted ... "diagnostic"`) is already strict (20 total + 5/tier). It will fire automatically once a regenerate fills the gap — no logic change needed there.

## Files touched

- `supabase/functions/generate-diagnostic-questions/index.ts` — accept `tiers` in body, filter `TIER_SPEC`, per-tier delete-then-insert, scope `partial` to requested tiers.
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — `handleRegenerateTiers`, per-tier "Regenerate" buttons in tier headers and partial toast, derive short tiers from live bank.

## Out of scope

- Background/queued regeneration (still synchronous, single invoke).
- Changing the validation bands or attempt counts.
- A "regenerate one specific question" action (different problem).
- Migration changes — `diagnostic_generation_runs` already supports partial-tier seeding because rows are inserted per tier per `run_id`.

## Validation

1. Run initial generate → land with hard short (current bug pattern). Confirm bank shows standard/easy/medium full, hard 0.
2. Click "Regenerate hard tier" → confirm only one tier row appears in the progress UI, other tiers' questions are untouched, and hard fills to 10/10.
3. Click "Regenerate all short tiers" with two tiers short → confirm both run in parallel, both update, others untouched.
4. After successful top-up to 5/5 per tier (20 total), confirm `diagnostic` setup step auto-marks complete.
