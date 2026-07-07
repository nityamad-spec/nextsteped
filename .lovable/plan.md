# Fix: weekly quiz stuck at 19 questions after cross-tier dedup

## Root cause

In `supabase/functions/generate-weekly-quiz/index.ts` (lines 808-828), the post-assembly cross-tier dedup pass drops any adaptive question whose stem/answer overlaps with a higher-priority tier — but it never regenerates a replacement. Function logs confirm the last run:

> `cross-tier dedup: dropped easy "True or False: The Google Cloud Marketplace only offers software solutions creat…" (duplicates hard "True or False: After deploying a VM-based solution from the Google Cloud Marketp…")`

So `easy` ended up with 4 kept + 1 dropped = 4, total 19 instead of 20. The response is flagged `partial: true` and the UI shows 19.

## Fix — single change, same file

Add a **backfill pass** right after the cross-tier dedup block (after line 828), before the DB insert:

1. Compute `shortfall = spec.count - kept-count` for each tier.
2. For each tier with `shortfall > 0` AND deadline budget remaining (e.g. `>25s` left):
   - Call `generateTier(spec, …, crossTierAvoid = [all currently kept questions])` with a temporary override of `spec.count = shortfall` (shallow-clone the spec so the module-level `TIER_SPEC` isn't mutated).
   - Run the returned questions through the same cross-tier dedup loop against `kept`; append survivors up to `shortfall`.
3. Cap attempts at 1 backfill call per tier — if it still comes up short, leave it and let `partial: true` stand (existing behavior).
4. Log `[weekly-quiz] backfill tier=<tier> requested=N delivered=M`.

Errors in the backfill call are swallowed (append to `tierErrors[tier]` as `"backfill failed: <msg>"`) — we never regress from 19 back to 0.

## Verification

1. On `/teacher/setup/lesson-plan`, click **Regenerate Weekly Quiz** for Google Cloud Infra CL01, Week 1.
2. Expect 20 rows in `WeeklyQuizReviewDialog` (5 per tier).
3. Check function logs for `backfill tier=easy requested=1 delivered=1` (or similar) and no remaining cross-tier duplicate warnings against `kept`.
4. If backfill genuinely can't produce a non-dup on a very small concept week, response is still `partial: true` at 19 — acceptable, matches today's contract.

## Not doing

- Loosening the dedup threshold — would reintroduce the original duplicate-questions bug we just fixed.
- Over-generating each tier (e.g. `count+1`) up front — wastes tokens on the common case where no dedup fires.
- Any frontend change — the dialog already renders whatever rows exist.
