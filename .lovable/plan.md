
## Goal

Make `supabase/functions/score-diagnostic/index.ts` compute `learner_level` from `branch_tier` + total `correctCount` (out of 20), matching the client `computeLearnerLevel` table exactly. Drop the `"expert"` tier from server output. Keep `mastery_score` and its components untouched — they remain in `diagnostic_results` for analytics but no longer drive the displayed level.

## New server rule (mirrors client)

| branch_tier | correct ≤ 10 | 11 ≤ correct ≤ 20 |
| --- | --- | --- |
| easy | beginner | developing |
| medium | beginner | developing |
| hard | developing | proficient |

Defensive: if `branch_tier` is null OR `answeredCount === 0` → `beginner`.

## Changes

### `supabase/functions/score-diagnostic/index.ts`
1. Narrow `LearnerLevel` type to `"beginner" | "developing" | "proficient"` (drop `"expert"`).
2. Remove `CONFIG.LEVEL_BANDS` and the `bandFor(score)` helper (dead once level no longer comes from mastery_score).
3. Replace the `const learnerLevel = bandFor(masteryScore);` line with a new helper:
   ```ts
   function levelFromBranch(branch: "easy"|"medium"|"hard"|null, correct: number, answered: number): LearnerLevel {
     if (!branch || answered <= 0) return "beginner";
     if (branch === "hard") return correct <= 10 ? "developing" : "proficient";
     return correct <= 10 ? "beginner" : "developing";
   }
   const learnerLevel = levelFromBranch(body.branch_tier ?? null, correctCount, answeredCount);
   ```
4. Keep everything else identical: `mastery_score`, `components.accuracy/pace/confidence`, `score`, `total_questions`, `branch_tier`, `answers`, `confidences`, `question_times`, `question_ids` all still written to `diagnostic_results` as before.

### Not changed
- `diagnostic_results.learner_level` column stays a free-text string; existing rows with `"expert"` are left as-is (historical). Only new inserts stop producing `"expert"`.
- Client `computeLearnerLevel` and its tests (already updated last turn).
- `pickBranchTier`, Phase A/B counts, `isAnswerCorrect`, `update-mastery`, admin UI heatmap/legend.
- No DB migration.

## Verification

- Existing student in the screenshot (20/20, branch Hard): re-submitting would now produce `proficient` instead of `expert`. (Existing row stays `expert` until re-taken or manually updated.)
- Confirm the edge function still returns `{ mastery_score, components, learner_level, score, total_questions }` with the same shape — only the level value changes.

## Out of scope
- No backfill of historical `diagnostic_results.learner_level` rows.
- No UI copy changes for the admin Students tab beyond what naturally follows from the value change.
- No changes to weekly quiz / exam / practice scoring.
