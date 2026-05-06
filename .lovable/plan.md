## Problem

In `supabase/functions/generate-diagnostic-questions/index.ts`, `computeTierQuota` calls `hamiltonAllocate(units.map(u => u.weight), 5)`. Because teacher weights are all 0 today, every unit ends up with equal weight, so the largest-remainder method ties on every fractional remainder. Ties are broken by array index, and units are sorted by `week_number` ascending — so weeks 1–5 always win every tier, and weeks 6–16 never receive a question.

## Goal

For each tier, the 5 slots should land on a **random sample of 5 weeks** (when there are more weeks than slots), instead of always the first 5. Across all 4 tiers (20 questions) this naturally spreads coverage over the whole semester. Real teacher-set weights, when present, should still bias the sampling.

## Design

### Weighted-random unit selection (replaces the front of `computeTierQuota`)

When `units.length > totalSlots` (e.g. 16 weeks, 5 slots):

1. Draw `totalSlots` units **without replacement**, with each unit's draw probability proportional to `unit.weight`. Use the standard weighted-reservoir trick: for each unit compute `key = rand() ** (1 / weight)` and take the top `totalSlots` keys. With uniform weights this collapses to a plain random sample; with non-uniform teacher weights, heavier units are more likely to be chosen.
2. Each selected unit gets exactly 1 slot for that tier. (No need to call Hamilton at the unit level in the over-supply case.)
3. Within each selected unit, keep the existing concept-level allocation (Hamilton on concept weights, capped at 1 per concept).

When `units.length <= totalSlots` (small courses):

- Keep current behavior: run Hamilton across all units so every unit gets ≥1 slot and the remainder is distributed by weight.

### Per-tier seeding

Seed the RNG with `${courseId}:${tier}:${Date.now()}` so:
- Each of the 4 tiers picks a (likely) different set of 5 weeks → over 20 questions, most weeks get coverage.
- Re-running generation produces a fresh random pick (teachers regenerating won't get the same five weeks again).

If we'd rather make it reproducible per course, drop `Date.now()` and use just `${courseId}:${tier}`. Default in this plan: include `Date.now()` for fresh randomness on each click.

Reuse the existing `mulberry32` PRNG style from `src/lib/seededShuffle.ts` (port the small helper into the edge function — edge functions can't import from `src/`).

### No other changes

- `hamiltonAllocate` stays as-is (still used inside each unit and in the small-course branch).
- Prompt formatting, validation, sanity-check, retry loop, UI distribution card — all unchanged. The "Distribution by Unit" card will now show different weeks each time.

## Files to edit

- `supabase/functions/generate-diagnostic-questions/index.ts` — add a small seeded-RNG helper, add `pickUnitsWeighted(units, k, rng)`, branch inside `computeTierQuota`, thread a per-tier seed from `runTier`.

## Validation

- `supabase--curl_edge_functions` against the global-economics course (16 weeks). Expect each tier's `distributionByUnit` to feature a different set of 5 weeks; across the full 20-question response, expect ≥10 distinct weeks represented (vs. 5 today).
- Re-run a second time → distribution should change (confirms randomness).
- Run on a small course with only 3 weeks → each tier still hits all 3 weeks (confirms small-course branch still works).
- Set non-zero weights on a few concepts via the Concepts page → those weeks should appear more often than zero-weight weeks across tiers.

## Out of scope

- Changing the 20/5 split, Bloom distribution, or the per-concept cap.
- Surfacing the seed to the UI.
- Schema changes.
