## Goal

Switch confidence from a 0–100 slider to a 3-step scale `[0, 1, 2]` (Not Confident / Somewhat Confident / Very Confident), and normalize it correctly inside the mastery calculation without changing the 15% confidence weight.

## Changes

### 1. `supabase/functions/score-diagnostic/index.ts` (CONFIG + normalization)

- Replace `CONFIDENCE_SCALE_MAX: 100` with an explicit 3-level map in the CONFIG block, single source of truth:
  ```ts
  CONFIDENCE_LEVELS: { 0: 0.0, 1: 0.5, 2: 1.0 },  // not / somewhat / very
  CONFIDENCE_DEFAULT: 1,                          // fallback if missing/invalid
  ```
- In the per-answer loop, replace `clamp01(c / CONFIDENCE_SCALE_MAX)` with a lookup:
  ```ts
  const raw = Number.isInteger(a.confidence) ? a.confidence : CONFIG.CONFIDENCE_DEFAULT;
  const key = Math.min(2, Math.max(0, raw as number));
  confidenceScores.push(CONFIG.CONFIDENCE_LEVELS[key]);
  ```
- `WEIGHTS.confidence` stays at `0.15`. Because the new normalized range is still `[0, 1]` (0.0 / 0.5 / 1.0), the contribution to `masteryScore` keeps the same magnitude — no other math changes.
- Tighten the zod schema for `confidence` to `z.number().int().min(0).max(2).optional()` so out-of-range client values are rejected with a clear 400.

### 2. `src/pages/student/DiagnosticQuiz.tsx` (UI + persisted values)

- Update `confidenceLabels` to `{ 0: "Not Confident", 1: "Somewhat Confident", 2: "Very Confident" }`.
- Change the slider props: `min={0} max={2} step={1}`, default value `[confidence ?? 1]`, label fallback `confidenceLabels[confidence ?? 1]`.
- Update the auto-initialize effect (currently sets `confidence = 50` when an answer exists) to set `1` instead.
- Update any other `?? 50` / `=== 50` defaults in that file to `?? 1`.
- No DB schema change. The `confidences` jsonb array on `diagnostic_results` will now store integers `0|1|2` going forward; legacy rows with 0/50/100 remain untouched (not rescored).

### 3. Scope guardrails

- No migration, no backfill of old `confidences` arrays, no change to `mastery_score`/`learner_level` columns.
- No changes to accuracy or pace logic, weights, or bands.
- No UI surfacing of mastery to students/teachers (per Core memory).

## Why the weight stays intact

Confidence still contributes `0.15 × confidenceScore` where `confidenceScore ∈ [0, 1]`. Only the mapping from raw input to that `[0, 1]` value changes (3 discrete points instead of 101). Max possible contribution to mastery is unchanged at `0.15`.

## Open question

Is the mapping `0 → 0.0, 1 → 0.5, 2 → 1.0` what you want, or do you prefer something less linear (e.g. `0 → 0.0, 1 → 0.6, 2 → 1.0` to reward "very confident + correct" more strongly, or `0 → 0.2, 1 → 0.5, 2 → 1.0` to avoid zeroing out the confidence component entirely when a student is unsure)? Default in the plan is the simple linear mapping.