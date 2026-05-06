## Goal

Have both concept suggestion edge functions return a suggested **weight** (with rationale) for every concept, and surface those weights in `/teacher/setup/concept-review` so the professor can review/adjust before approving. Approved weights are persisted to `concepts.weight` (already 0–1 numeric in DB).

## Weighting model

- **Extracted Concepts** (`suggest-concepts`): AI returns an integer `weight_pct` (1–100) per concept such that **the sum across all extracted concepts ≈ 100%** (full-course normalization). The rationale already exists; we add a separate one-line `weight_rationale` explaining why this concept gets its share (breadth, depth, foundational role, time-on-task, etc.).
- **Additional Recommendations** (`recommend-additional-concepts`): AI returns `weight_pct` (1–10) per concept — these are supplementary and are not expected to sum to 100. Same `weight_rationale` field.
- Server-side clamps: `weight_pct` coerced into 1–100 (extracted) / 1–15 (recs); falls back to a sensible default (e.g. `Math.round(100/N)` or `5`) if missing.
- DB stays unchanged: insert as `weight = weight_pct / 100` (matches the existing 0–1 scale used by `ConceptManagement.tsx`).

## Edge function changes

### `supabase/functions/suggest-concepts/index.ts`
- Extend the tool schema's per-concept object with `weight_pct: integer` and `weight_rationale: string` (both required).
- Update `systemPrompt` with explicit weighting instructions: integer percent, full set sums to ~100, weight reflects relative teaching emphasis (breadth × depth × foundational importance), per-unit weights should roughly track unit breadth.
- After parsing, normalize: if the sum deviates >5% from 100, scale proportionally and re-round (largest-remainder).
- Carry `weight_pct` and `weight_rationale` through to the flat `suggestions` array returned to the client.

### `supabase/functions/recommend-additional-concepts/index.ts`
- Extend the tool schema with `weight_pct: integer` (1–15) and `weight_rationale: string`.
- Update `systemPrompt` to instruct the model to assign a small supplementary weight per recommendation reflecting how much course time it deserves if added.
- Pass both fields through in the cleaned `recommendations` payload.

## Frontend changes — `src/pages/teacher/ConceptReview.tsx`

- Extend `Suggestion` and `Recommendation` interfaces with `weight_pct?: number` and `weight_rationale?: string`.
- Local editable state per card: `Map<conceptName, number>` storing the current `weight_pct` (initialized from AI response, editable by the teacher via a small number input, e.g. 1–100 with `%` suffix).
- Render in each suggestion / recommendation card:
  - A "Suggested weight" pill (`<Badge>` with `Scale` / `Percent` icon) showing the editable `weight_pct` next to the existing rationale.
  - Below the existing rationale, a smaller muted line: `Why this weight: {weight_rationale}`.
- Update insert calls to use the edited weight:
  - `handleAddSuggestion`, `handleAddAllInUnit`, `handleApproveRecommendation` → insert `weight: weight_pct / 100` instead of the hard-coded `0`.
  - Manual add (`handleAddManual`) keeps `weight: 0` (no AI suggestion exists for it).
- "Add All in Unit" uses each item's current edited weight.
- `Confirmed Concepts` list adds a small `{Math.round(c.weight * 100)}%` badge next to the concept name so the teacher can see what was saved (read-only here; full editing remains on `/teacher/concepts`).

## Out of scope

- No DB schema changes (`concepts.weight` already exists).
- No changes to `ConceptManagement.tsx` editor.
- No changes to diagnostic generation — it already consumes `weight` from the `concepts` table, so it benefits automatically once non-zero weights are saved.

## Files touched

- `supabase/functions/suggest-concepts/index.ts`
- `supabase/functions/recommend-additional-concepts/index.ts`
- `src/pages/teacher/ConceptReview.tsx`
