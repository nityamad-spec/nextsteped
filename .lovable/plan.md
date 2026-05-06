## Goal

Make per-unit concept ordering in `suggest-concepts` fully deterministic so identical inputs always yield identical output, even when multiple concepts share the same first-matched topic index.

## Current behavior (and gap)

In `supabase/functions/suggest-concepts/index.ts`, after the AI call we compute:

```
firstIdx = smallest topic index in unit.topics matched by any covers_topics entry (or concept name)
sort by (firstIdx, origIdx)
```

Issues:
1. `firstIdx` is computed by iterating `covers_topics` in array order and breaking on first match — so two concepts whose `covers_topics` reorder the same topics can get different `firstIdx`. Not stable across regenerations.
2. `origIdx` (LLM emission order) is the only tie-breaker — non-deterministic across runs.
3. Concepts whose topics don't match anything all collapse to `MAX_SAFE_INTEGER` and fall back to `origIdx` — also non-deterministic.

## Plan

Rewrite the per-unit reorder block to compute a **full deterministic sort key** per concept:

1. **Primary key — `firstIdx`**: smallest index `i` in `unit.topics` such that ANY entry in `covers_topics ∪ {name}` matches `topics[i]` via existing `topicCoveredBy`. Iterate `topics` in order and check all covers (not the other way around) so the result is independent of `covers_topics` ordering.

2. **Secondary key — `coverageSignature`**: sorted tuple of ALL matched topic indices for that concept (not just the first). Compared lexicographically. This means a concept that covers topics [2,5] always sorts before one that covers [2,7], regardless of LLM order.

3. **Tertiary key — `matchCount`**: number of matched topics (more-specific concepts before broader ones at the same starting index). Optional; place after coverageSignature.

4. **Quaternary key — normalized name**: `norm(c.name)` lexicographic ascending. Guarantees a deterministic answer for genuinely identical coverage.

5. **Unmatched concepts** (no topic match): bucket them at the end, sorted by normalized name only (drop `origIdx` entirely so output is independent of LLM emission order).

6. Apply the same deterministic sort to the cross-unit ordering tie-breaker too: replace `(a.unit_number||0) - (b.unit_number||0)` sort with a stable comparator that also tie-breaks on `norm(unit_title)` when unit numbers collide.

7. Keep the dedup pass and weight normalization unchanged. The dedup `seen` set is already insertion-order based — since insertion order is now deterministic, dedup outcome is deterministic too.

## Out of scope

- No prompt or model changes.
- No frontend changes (`ConceptReview.tsx` already renders in array order).
- Confirmed-concepts list ordering, lesson plan, weights — untouched.

## Files to edit

- `supabase/functions/suggest-concepts/index.ts` — replace the reorder block (currently the `for (const u of cleanUnits)` loop that builds `indexed` and sorts by `firstIdx, origIdx`) and the `parsedUnits.sort(...)` call inside `cleanUnits` construction.
