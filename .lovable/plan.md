# Switch model to Gemini 2.5 Pro and extend timeout to 300s

Scope: `supabase/functions/generate-weekly-quiz/index.ts` only. No validator, DB, client, or shared-code changes.

## Changes

### 1. Model
- Line 108: `const MODEL = "google/gemini-2.5-flash";` → `const MODEL = "google/gemini-2.5-pro";`
- Rationale: user wants higher-quality generation for the weekly quiz; Pro tends to reduce validator rejections (better difficulty/Bloom/explanation compliance), which pairs well with the longer budget.

### 2. Global wall-clock budget: 150s → 300s
- Line 111: `const GLOBAL_DEADLINE_MS = 130_000;` → `const GLOBAL_DEADLINE_MS = 280_000;`
  - Keeps the same ~20s safety margin under the new 300s Supabase edge invoke cap that the user is targeting (previous value was 130s under a 150s cap).
- Update the header comment on line 109–110 to reference the new 300s cap.

### 3. Per-call timeouts (raised to match Pro's higher latency)
Pro is slower than Flash; with the wider global budget we can afford longer per-call aborts without starving backfill.
- Lines 76, 85, 94 (easy/medium/standard): `perCallTimeoutMs: 25_000` → `50_000`
- Line 103 (hard): `perCallTimeoutMs: 30_000` → `60_000`

### 4. Reserved backfill window
- Line 649: keep the "reserve 45s for backfill" split, but widen it to match the new budget:
  `mainPassDeadline = Math.min(deadlineAt, Date.now() + (GLOBAL_DEADLINE_MS - 90_000))`
  - Main pass gets ~190s, guarantee-backfill phase gets ~90s (three passes × ~30s each), preserving the 3-pass structure with room for Pro-latency retries.

## Not changing
- `MAX_ATTEMPTS`, `SAME_TIER_PROMPT_CAP`, `CROSS_TIER_PROMPT_CAP`, over-generation buffer, validator pipeline, dedup priority, and the 3-pass guarantee-backfill loop all stay as they are.
- Response shape (`{ ok, generated, requested, partial, by_tier, tier_errors }`) unchanged.
- Note: user wrote "300ms / 150ms" — read as **seconds** to match the existing `GLOBAL_DEADLINE_MS` units (150s current, 300s target). Confirm if the intent was literally milliseconds.
