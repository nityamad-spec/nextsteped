---
name: Standardized attempt scoring
description: Single shared scoring module (80/20 accuracy+pace, Bloom weights, reasoning verdict factor) used by every testing format
type: feature
---

All testing formats (weekly quiz, exam, practice, diagnostic) score identically through one module:
`supabase/functions/_shared/attempt-scoring.ts`. `src/lib/masteryScoring.ts` re-exports it — never
create a mirrored copy of the math.

Per question:
- `maxPoints = difficulty × bloomWeight[bloom]` (1.0/1.2/1.5/1.8/2.1/2.5 for Bloom 1-6)
- Bloom ≥ 3 reasoning factor: correct+accepted (or no verdict) = 1, correct+rejected = 0.5,
  wrong+accepted = 0.5, wrong+rejected/none = 0. Bloom ≤ 2 always 1 if correct, else 0.
- `earned = maxPoints × factor`

Aggregate: `accuracy = Σearned / ΣmaxPoints`, `pace = mean(paceCurve(actualMs / expectedMs))`,
`score = round(100 × (0.80 × accuracy + 0.20 × pace))`. Missing timing counts as on-pace.

Mastery: raw signal → Beta shrinkage `w = n/(n+8)` toward 0.5 → EMA blend by source
(quiz 0.4, exam 0.6, practice 0.15, diagnostic 0.4). Course mastery = weighted concept average over
ALL course concepts. Multi-concept formats (diagnostic, exam) send per-concept signals to
`update-mastery` via the `per_concept[].signal` field.
