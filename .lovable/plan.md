## Overall course mastery = weighted avg over ALL course concepts

Current bug: `update-mastery` divides the weighted sum by the sum of weights of **explored** concepts only, so 2/14 explored concepts at 39% and 54% show as 45% overall. Fix: divide by the sum of weights of **every concept in the course**, so unexplored concepts count as 0% and Overall reflects true course-wide progress.

### Change

`supabase/functions/update-mastery/index.ts` (around lines 279–291):

- Compute `totalCourseWeight = Σ weight for every row in courseConcepts` (already loaded into `byId` at line 127).
- Keep `weightedSum` as-is (sum of `mastery_score × weight` over concepts with a row).
- `courseScore = totalCourseWeight > 0 ? clamp01(weightedSum / totalCourseWeight) : 0`
- `weightTotal` variable (denominator of explored-only weights) is no longer used for `courseScore`, but the `weightTotal === 0` warning stays — repurpose it to warn when `totalCourseWeight === 0` (course has no concepts).
- `contributing` and `nonPracticeContributors` counters unchanged — they still drive the practice-only gate.

### Test update

`supabase/functions/update-mastery/integration_test.ts` line 228: fixture has 2 concepts A/B each with weight 0.5. Test only writes concept A at 0.6923. New expected course score = `0.6923 × 0.5 / (0.5 + 0.5) = 0.3462`. Update the assertion to `assertAlmostEquals(Number(course!.mastery_score), 0.3462, 1e-3)` and adjust the comment. No other assertions in that file change (the exam test at line 234 populates both concepts).

### Not changed

- `student_concept_mastery` rows and per-concept scores/levels — unchanged.
- Frontend `StudentHome.tsx` — no changes; it just reads the number.
- No DB migration.
