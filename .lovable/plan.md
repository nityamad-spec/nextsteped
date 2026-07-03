## Bug

In `StudentProfileDialog.tsx`, quiz/exam attempt percentages are computed as `Math.floor((score / total_questions) * 100)`. But in `assessment_results`, `score` is already stored as a 0–100 percentage (with `correct_answers` holding the raw count). So 100% becomes 1000%, 70% becomes 700%, etc.

Also affects practice accuracy, which sums `score` over `total_questions` — same over-multiplication.

## Fix

In `src/components/admin/StudentProfileDialog.tsx`:

- Quiz/exam attempt score: use `r.score` directly (clamped to 0–100) instead of dividing by `total_questions`.
- Practice accuracy: sum `correct_answers` / sum `total_questions` × 100 (switch from `score` to `correct_answers`), so the ratio is meaningful across attempts of different sizes.

No schema or backend changes. Frontend-only, no other files touched.
