# Two-stage adaptive diagnostic (standard → branched tier)

## Goal

1. Generation produces **10 questions per tier** (standard / easy / medium / hard) = **40 stored questions per course**.
2. At quiz time the student takes **20 questions**: all 10 standard first, then 10 from a single adaptive tier (easy / medium / hard) chosen from the student's standard-tier score.

## Branching thresholds (standard tier, 10 questions)

Proposed, based on existing learner-level cutoffs:

- `correct / 10 < 0.4`  → **easy** branch
- `0.4 ≤ correct / 10 < 0.75` → **medium** branch
- `correct / 10 ≥ 0.75` → **hard** branch

(Open question for confirmation — see end.)

## Schema change

Add a `tier` column to `diagnostic_questions` so the quiz can filter by tier at runtime.

```text
ALTER TABLE public.diagnostic_questions
  ADD COLUMN tier text NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('standard','easy','medium','hard'));
CREATE INDEX idx_diagnostic_questions_course_tier
  ON public.diagnostic_questions (course_id, tier);
```

No backfill of meaningful tier values: existing rows get `'standard'` and will be replaced the next time a teacher regenerates (the edge function already `DELETE`s by `course_id` before insert).

## Edge function: `generate-diagnostic-questions`

- `TIER_SPEC[*].count`: `5 → 10` for all four tiers.
- Insert rows now include `tier: t.tier`.
- `item_code` counter stays per-tier-prefixed (`Q-STANDARD-001 … 010`, `Q-EASY-001 … 010`, …).
- Final guard: change `rows.length !== 20` → `rows.length !== 40`; update the success message accordingly.
- `computeTierQuota` keeps working — it just receives `totalSlots = 10` per tier, so distribution stays proportional to concept weights.
- No prompt rewording needed beyond the dynamic `needed` count which is already templated.

## Quiz: `src/pages/student/DiagnosticQuiz.tsx`

Rework `init()` and `handleAnswer()` to run in two phases:

1. **Phase A — Standard (10 Qs)**
   - Load all `tier = 'standard'` questions for the course, seeded-shuffle, present.
   - Track answers/confidences/times exactly as today.
2. **Branching point** (after question 10 is answered, before submit):
   - Compute `standardCorrect = count(is_correct) over the 10 standard answers`.
   - `branchTier = standardCorrect < 4 ? 'easy' : standardCorrect < 8 ? 'medium' : 'hard'`.
   - Fetch the 10 questions for that tier, seeded-shuffle, append to `questions[]`, continue to question 11.
3. **Phase B — Adaptive tier (10 Qs)**
   - Standard quiz UX continues; progress bar = `currentQ / 20`.
4. **Finish (after Q20)**
   - Final score = correct across all 20.
   - `learner_level` cutoffs reused as today (`ratio` thresholds), unchanged.
   - Persist `branch_tier` inside the `answers` JSONB blob (per-question already records `topic`; add a top-level marker by storing it inside the row's `answers[0]` or as a synthetic last entry — see Technical details).

### Resume-from-localStorage

The current `progressKey` payload assumes a single fixed shuffled list. Update it to also persist:

- `phase: 'standard' | 'adaptive'`
- `branchTier: 'easy' | 'medium' | 'hard' | null`
- `standardQuestionIds`, `adaptiveQuestionIds` (so the prefix-match resume check can validate both halves)

If a saved progress file is malformed under the new shape (older v1 payload), discard it and restart at intro.

## Technical details

- **Persisting branch tier in `diagnostic_results`:** Add a new `branch_tier text` column on `diagnostic_results` (nullable, no check constraint) so analytics can see which adaptive half the student took. Insert it alongside `score` / `learner_level` in `handleAnswer`.
- **Course-level guard:** The student-side fetch should still verify all four tiers have 10 rows; if `tier='standard'` count < 10 or chosen branch tier count < 10, show the existing "No diagnostic questions are available" intro state.
- **Teacher setup page (`DiagnosticQuestionsSetup.tsx`):** Today it lists `diagnostic_questions` for the course. Add a `tier` badge column so teachers can see the four buckets; group the table by tier. Pure presentation, no logic change to save/reload.
- **Bump localStorage progress payload version** `v: 1 → v: 2` to invalidate any in-flight pre-change attempts.
- **No change to `seededShuffle`**: shuffle standard set with seed `userId+courseId+":standard"`, adaptive set with `userId+courseId+":"+branchTier`. Each half stays deterministic and independent.

## Files touched

- New migration — add `tier` column + index on `diagnostic_questions`, add `branch_tier` column on `diagnostic_results`.
- `supabase/functions/generate-diagnostic-questions/index.ts` — counts, insert payload, final guard.
- `src/pages/student/DiagnosticQuiz.tsx` — two-phase loading, branching, resume payload, insert payload.
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — surface tier in the list (optional but recommended).

## Open question

Branching thresholds — confirm `<4` easy / `4–7` medium / `≥8` hard, or specify different cutoffs.
