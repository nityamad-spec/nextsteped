# Unify BLOOM_WEIGHT across the scoring stack

Bloom weights `{1:1.0, 2:1.2, 3:1.5, 4:1.8, 5:2.1, 6:2.5}` are currently written out in three
places. Only one of them is the canonical definition; the other two are hand-copies that can
silently drift.

## Current state

- `supabase/functions/_shared/attempt-scoring.ts` — exports `BLOOM_WEIGHT`. Canonical. Used by
  `maxPointsFor`, re-exported to the browser through `src/lib/masteryScoring.ts`.
- `supabase/functions/update-mastery/mastery.ts` — `MASTERY_CONFIG.BLOOM_WEIGHT` holds a literal
  copy. Nothing reads it: neither `mastery.ts`, `update-mastery/index.ts`, nor `mastery_test.ts`
  references that key.
- `src/components/AssessmentView.tsx` line 69 — a local `const BLOOM_WEIGHT` copy (plus local
  `clamp01` / `clampBloom` copies).

## Changes

1. **`update-mastery/mastery.ts`** — remove the `BLOOM_WEIGHT` key from `MASTERY_CONFIG`. The file
   stays dependency-free; any future need for the weights imports them from
   `../_shared/attempt-scoring.ts`. A short comment records where the weights live.
2. **`src/components/AssessmentView.tsx`** — delete the local `BLOOM_WEIGHT`, `clamp01` and
   `clampBloom` declarations and import them from `@/lib/masteryScoring` instead. Values are
   identical, so behaviour is unchanged.
3. **`_shared/attempt-scoring.ts` header comment** — correct the stale note claiming
   `src/lib/masteryScoring.ts` is a mirror kept honest by a parity test. It is a thin re-export of
   this file, guarded by an identity assertion in `src/lib/attemptScoring.test.ts`. Add a line
   naming this file as the sole home of `BLOOM_WEIGHT`.

## Verification

- `deno test` for `_shared/attempt-scoring_test.ts` and `update-mastery/mastery_test.ts`.
- Frontend vitest run (`src/lib/attemptScoring.test.ts`, `masteryScoring.test.ts`,
  `reasoningScoring.integration.test.tsx`).
- Per project rules, any failures are reported back rather than auto-fixed.

## Risk

Low. No stored scores or database values change; step 1 deletes dead config and step 2 substitutes
numerically identical constants.
