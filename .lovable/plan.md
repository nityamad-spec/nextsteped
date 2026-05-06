## Current behavior

In `supabase/functions/generate-diagnostic-questions/index.ts`:

- All concepts for the course are loaded (`select id, concept_code, weight from concepts where course_id = ...`) and passed to Gemini as a flat comma-separated string.
- The model freely picks any concept_code per question. Validation only checks the topic exists in the list — there is no quota per concept or per unit.
- `concepts.weight` exists but is **0 for every row** in the DB (unused). Concepts have no `unit_id` / `week_id` column either; the lesson-plan ↔ concept link lives in `lesson_plan_weeks.concepts` (a JSONB array of `{id, name, ...}` where `id` is a `lesson_plan_weeks` internal id, not a `concepts.id`).
- Empirical result on the global-economics course: 78 concepts, only ~14 received any question, top concept got 3, most got 0.

So today there is **no enforcement of distribution across units or weights**. The model concentrates on a handful of "interesting" concepts.

## Goal

Distribute the 20 diagnostic questions (5 per tier) across the course's units (weeks of the lesson plan) and respect concept weights, with a hard server-side check that no single unit/concept dominates.

## Design

### 1. Build a weighted concept→unit map

At the start of the request, in addition to loading `concepts`, also load `lesson_plan_weeks` for the course and build:

```ts
type ConceptInfo = {
  id: string;
  code: string;
  weight: number;          // from concepts.weight, or fallback
  weekNumber: number | null; // resolved by name match against lesson_plan_weeks.concepts[].name
  weekName: string | null;
};
```

Resolution:
- For each `lesson_plan_weeks` row, walk `concepts` JSONB array, take each `name`, and case-insensitively match against `concepts.concept_code`. Tag the concept with that week.
- Concepts not appearing in any week get `weekNumber = null` (treated as a synthetic "Unassigned" unit).

Weight fallback: since all `weight` values are 0 today, treat 0 as "uniform" — every concept in a unit gets weight `1 / nConceptsInUnit`. Once teachers set real weights via the Concepts page, those override the fallback.

### 2. Compute a per-tier quota

For each tier (5 questions), distribute the 5 slots across units proportional to the unit's aggregate weight (sum of concept weights in that unit, normalized to 1 across the course).

Algorithm: largest-remainder method (Hamilton) to avoid rounding loss — guarantees the slots sum exactly to 5 per tier.

Within each unit's allotment, distribute slots to concepts proportional to per-concept weight (also Hamilton). Cap at 1 question per concept per tier when the unit has more concepts than slots; only allow a second question on the same concept if every other concept in that unit already has one.

Output: a `Map<conceptCode, slotsForThisTier>` per tier — the model's exact target.

Edge cases:
- Course with <5 units → some units get >1 slot per tier (Hamilton handles).
- Course with >5 units in a tier → only top-5-weighted units get a slot that tier; rotate across tiers so over 4 tiers (20 questions) every unit with weight >0 receives at least one question if possible.
- 0 concepts in a course → fail fast (already handled).

### 3. Pass quota to the LLM and enforce on validation

In `callGateway`:
- Replace the flat `conceptList` string with a structured per-unit block:
  ```
  Unit 1 — Foundations of Global Financial Stability (target: 2 questions)
    - Defining Macro-Financial Stability (target: 1)
    - Globalization and Financial Integration (target: 1)
  Unit 2 — Exchange Rates and Early Crises (target: 1)
    - Exchange Rate Determination (target: 1)
  ...
  ```
- Add a strict instruction: "Each question's `topic` MUST be one of the listed concept_codes. Generate exactly the target count for each concept. Do not exceed the target for any concept."

In `runTier`, after collecting candidates, run a **post-validation distribution check**:
- Build `acceptedByCode` count.
- If any concept is over-quota, drop the surplus rows (keep first N).
- If under-quota, fall through to the existing retry loop with a `retryHint` listing the missing concept_codes and how many of each are still needed.

### 4. Final pre-insert sanity check

Before the bulk insert, assert:
- `accepted.length === 20` (already enforced).
- For each concept_code, `count <= quota * tolerance` where tolerance allows ±0 by default (strict). If violated → 422 with breakdown.
- For each unit, `count >= ceil(unitTotalQuota * 0.8)` to catch the case where one unit is silently starved.

If checks fail → return 422 with `breakdown.distribution` so the UI can show which units / concepts came up short.

### 5. UI

`src/pages/teacher/DiagnosticQuestionsSetup.tsx`:
- After successful generation, show a small "Distribution by Unit" summary card listing `Unit N (X questions)` so the teacher sees the spread.
- Add a single sentence in the footer: "Questions are distributed across units in proportion to concept weights set on the Concepts page."
- On 422 with `breakdown.distribution`, surface the under-filled units in the toast + breakdown panel.

Optional (not required for this plan): button on Concepts page to "Auto-balance weights to equal" since 0-weights are everywhere today.

## Out of scope

- Schema changes (no `concepts.unit_id` column added — we resolve via `lesson_plan_weeks.concepts` JSONB).
- Editing teacher weights from the Diagnostic page.
- Changing the 20-question total or 5-per-tier split.
- Bloom-level distribution (already loosely enforced).

## Files to edit

- `supabase/functions/generate-diagnostic-questions/index.ts` — concept loading, quota computation, prompt restructure, validation tightening, sanity check.
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — distribution summary, error surfacing, footer copy.

## Validation

- Run `supabase--curl_edge_functions` against the global-economics course (16 weeks, 78 concepts).
- Expect: 20 rows, ≤4 questions per unit, every unit with concept weight >0 represented, no concept appearing more than 2 times across the full diagnostic.
- `supabase--read_query`:
  ```sql
  select week_number, count(*)
  from diagnostic_questions dq
  join concepts c on c.id = dq.concept_id
  -- join via lesson_plan_weeks resolution helper or a temp CTE
  group by week_number order by week_number;
  ```
- Force a course where one unit has weight 0 → confirm zero questions land on it.
