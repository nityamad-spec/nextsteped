# Source-weighted mastery updates

Replace the single `EMA_ALPHA = 0.4` in `supabase/functions/update-mastery/index.ts` with a per-source alpha map, so the same correct/incorrect signal moves a concept's score by different amounts depending on where it came from. Internal signal computation (difficulty × Bloom weight) is unchanged — a hard, high-Bloom practice question still outweighs an easy practice MCQ inside the practice submission itself.

## Alpha map

```text
weekly_quiz → 0.4
exam        → 0.6
practice    → 0.1
diagnostic  → 0.4   (kept for back-compat; no live caller)
```

Effect per submission, given prior score `p` and signal `s`:
`new_score = α_source · s + (1 − α_source) · p`

First-ever sample for a concept (`sample_count = 0`) still bypasses the blend and stores `s` directly — same as today.

## Changes (single file)

`supabase/functions/update-mastery/index.ts`

1. Replace the constant:
   ```ts
   EMA_ALPHA: 0.4
   ```
   with:
   ```ts
   EMA_ALPHA_BY_SOURCE: {
     weekly_quiz: 0.4,
     exam:        0.6,
     practice:    0.1,
     diagnostic:  0.4,
   } as Record<string, number>,
   EMA_ALPHA_DEFAULT: 0.4,
   ```
2. In the per-concept update loop, resolve alpha from `body.source`:
   ```ts
   const alpha = MASTERY_CONFIG.EMA_ALPHA_BY_SOURCE[body.source]
              ?? MASTERY_CONFIG.EMA_ALPHA_DEFAULT;
   const newScore = !prior || prior.sample_count === 0
     ? signal
     : clamp01(alpha * signal + (1 - alpha) * prior.mastery_score);
   ```
3. Keep `signal` computation untouched (weighted `earned/max` when `per_question` is provided, legacy `correct/attempted` otherwise).
4. Keep the course-mastery weighted-average step untouched (it already re-derives from all concept rows; no per-source logic needed there).

## Non-changes

- No DB schema changes. `last_source` is already stored per concept row.
- No changes to callers (`weekly_quiz`, `exam`, `practice` already send the correct `source` string).
- No changes to `score-diagnostic` (diagnostic doesn't call this function).
- Bloom weights and difficulty scaling inside `signal` are preserved verbatim.

## Verification

- Deploy the function and spot-check via `student_concept_mastery.last_source` + `mastery_score` after one practice submission vs one exam submission on the same concept: exam should move the score ~6× more than practice for the same signal delta.
- Existing `WeeklyQuizDialog.test.tsx` / `StudentHome.test.tsx` paths remain valid (they don't assert on alpha math).
