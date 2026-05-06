## Goal

In `/teacher/setup/concept-review`, the "Extracted Concepts" list must appear in the exact order topics appear in the syllabus JSON — both across units and within each unit.

## Current behavior

`supabase/functions/suggest-concepts/index.ts`:
- Units are sorted by `unit_number` (good — matches syllabus).
- Within a unit, concepts come back in whatever order the LLM emitted them. They are NOT re-aligned to the unit's `topics[]` order.
- The flat `suggestions[]` then preserves that LLM-internal order.

So a syllabus unit with topics `[A, B, C, D]` may yield concepts in order `[C-concept, A-concept, …]`, and the UI renders them that way.

## Fix

Re-sort concepts inside each unit by the index of the first syllabus topic they cover (`covers_topics`), using the unit's verbatim `topics[]` order from `normalizeUnits()`.

### Backend changes — `supabase/functions/suggest-concepts/index.ts`

1. Build a per-unit topic-index map keyed by normalized topic string (reuse the existing `norm()` helper).
2. For each concept in `cleanUnits[u]`, compute `firstTopicIdx`:
   - For each entry in `c.covers_topics`, find the smallest index `i` in `units[u].topics` where `topicCoveredBy(topic_i, [coveredEntry])` is true (same matching rule already used for coverage).
   - Take the minimum across all `covers_topics` entries.
   - If none match, fall back to a large sentinel (`Number.MAX_SAFE_INTEGER`) so unmatched concepts sink to the bottom of their unit but keep stable order.
3. Stable-sort the unit's `concepts` array by `(firstTopicIdx, originalIndex)` before flattening into `flat[]`.
4. Keep the existing unit-level `sort((a,b) => unit_number)` — that already gives correct cross-unit order.
5. Weight normalization runs after sorting, so percentages are unaffected.

No schema, no model, no prompt changes — purely a deterministic post-processing reorder.

### Frontend changes — `src/pages/teacher/ConceptReview.tsx`

- Already groups by `unit_number` and renders in array order. Once the backend returns sorted suggestions, no UI change is needed.
- Verify: the grouping loop at lines ~427–445 preserves insertion order, so the new backend order flows through.

### Out of scope

- Confirmed Concepts list ordering (uses `created_at` + manual reordering — separate concern).
- Lesson-plan generation (already consumes concepts in `concepts` table order).
- Re-running the LLM or changing prompts.

## Files to edit

- `supabase/functions/suggest-concepts/index.ts` — add the per-unit topic-index sort step right before the `flat = cleanUnits.flatMap(...)` block.

## Acceptance

- For a syllabus with unit topics `[A, B, C]`, the Extracted Concepts panel shows that unit's concepts in A→B→C order based on each concept's `covers_topics`.
- Concepts that don't match any topic in their unit appear after matched concepts (stable order).
- Cross-unit order continues to follow `unit_number` ascending.
