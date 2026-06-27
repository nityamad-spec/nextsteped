
# Fix: Prevent "Expert" from a Single Quiz

## Problem (recap)

In `update-mastery/index.ts`, the first submission for a concept sets `new_score = signal` directly (no prior). One perfect weekly quiz on a concept → `mastery_score = 1.0` → `mastery_level = "expert"`. Even after a few submissions, the EMA has no notion of "how much evidence do we actually have."

## Fix — Two layers

### Layer 1: Beta-prior shrinkage on the signal

Before blending the new submission's `signal` into the EMA, shrink it toward a neutral prior of `0.5` using the number of questions seen so far for that concept. As evidence grows, shrinkage fades and the signal speaks for itself.

```text
PRIOR        = 0.5    // neutral
PRIOR_STRENGTH = 8    // ~8 "pseudo-questions" of doubt

n             = questions_attempted_before_this_submission + questions_in_this_submission
shrink_weight = n / (n + PRIOR_STRENGTH)
shrunk_signal = shrink_weight * raw_signal + (1 - shrink_weight) * PRIOR
```

Then feed `shrunk_signal` into the existing EMA:

```text
// First-ever submission for this concept
new_score = shrunk_signal

// Subsequent submissions
new_score = alpha * shrunk_signal + (1 - alpha) * prior_mastery_score
```

`alpha` (per-source weight) and the weighted Bloom/difficulty `raw_signal` computation are unchanged.

### Layer 2: Evidence-gated level cap

`mastery_score` keeps its raw numeric value (so internal math is honest), but the **displayed `mastery_level`** is capped until enough evidence exists:

```text
attempted = student_concept_mastery.questions_attempted
samples   = student_concept_mastery.sample_count   // distinct submissions

if attempted < 8:                       cap = "developing"
elif attempted < 15 or samples < 2:     cap = "proficient"
else:                                   cap = none (expert allowed)

mastery_level = min(bandFor(score), cap)
```

This guarantees a single submission can never display "expert", regardless of score.

### Layer 3 (course level): Practice-only gate

At the course level, block "expert" if every contributing submission came from `practice`:

```text
if last_source = "practice" for ALL contributing concept rows:
   course_level capped at "proficient"
```

This prevents farming the practice widget to reach expert.

## Worked example

Concept `LOOPS`, `PRIOR=0.5`, `PRIOR_STRENGTH=8`, weekly_quiz `alpha=0.4`.

**Submission 1** — Weekly quiz, 5/5 correct on LOOPS questions
- raw_signal = 1.0
- n = 5, shrink_weight = 5/13 ≈ 0.385
- shrunk_signal = 0.385×1.0 + 0.615×0.5 = **0.692**
- First submission → mastery_score = **0.69**
- attempted=5, samples=1 → cap = "developing"
- bandFor(0.69) = "proficient" → **displayed level = "developing"** ✅ (was "expert")

**Submission 2** — Practice, 4/5 correct on LOOPS
- raw_signal = 0.8
- n = 10, shrink_weight = 10/18 ≈ 0.556
- shrunk_signal = 0.556×0.8 + 0.444×0.5 = **0.667**
- alpha(practice)=0.1 → new_score = 0.1×0.667 + 0.9×0.69 = **0.687**
- attempted=10, samples=2 → cap = "proficient"
- bandFor(0.687) = "proficient" → **displayed = "proficient"**

**Submission 3** — Exam, 5/5 correct on LOOPS
- raw_signal = 1.0
- n = 15, shrink_weight = 15/23 ≈ 0.652
- shrunk_signal = 0.652×1.0 + 0.348×0.5 = **0.826**
- alpha(exam)=0.6 → new_score = 0.6×0.826 + 0.4×0.687 = **0.770**
- attempted=15, samples=3 → cap removed
- bandFor(0.77) = "expert" → **displayed = "expert"** ✅ (earned across 3 distinct assessments)

Compare to today: Submission 1 alone would have shown **expert at 1.00**.

## Files to change

- `supabase/functions/update-mastery/index.ts`
  - Add `PRIOR`, `PRIOR_STRENGTH`, `LEVEL_CAP_THRESHOLDS` to `MASTERY_CONFIG`.
  - In the per-concept loop: compute `shrunk_signal` from raw `signal` and `attempted` (post-update count), then plug into existing EMA branches.
  - New helper `cappedLevel(rawLevel, attempted, samples)` applied when writing `mastery_level`.
  - Course-level: detect "all practice" and clamp `course_level`.

- One-time SQL backfill (separate migration after function ships):
  - Recompute `mastery_level` for existing `student_concept_mastery` rows using current `mastery_score` + `questions_attempted` + `sample_count` and the new cap.
  - Recompute `learner_level` on `student_course_mastery` using the same band + practice gate.
  - `mastery_score` values are left as-is (we can't replay history without raw submissions).

## Risks

1. **Existing scores look inflated for a day.** Backfill only fixes the *level label*, not the numeric score. Users currently shown as "expert" with 1 quiz drop to "developing". Communicate this.
2. **Progress feels slower.** Reaching "expert" now requires ≥15 questions and ≥2 submissions on a concept. This is the point, but expect feedback.
3. **Practice farming still moves the score** (just not the course level). If we want stricter, we can also require ≥1 non-practice submission per concept before that concept's level can exceed "proficient" — extra rule, more user friction.
4. **Tuning sensitivity.** `PRIOR_STRENGTH=8` and the `8/15` thresholds are judgment calls. If too strict, weekly-quiz-heavy courses feel stuck; if too loose, problem returns. Easy to adjust in one config block.
5. **`questions_attempted` integrity.** Cap relies on this counter being accurate. It's only written by this function, so safe — but any future direct DB writes would bypass the gate.
6. **No schema change**, so rollback = revert the function + rerun a backfill that re-derives levels from `bandFor(score)` without the cap.

## Verification

- Unit-style probe: invoke the function with a synthetic 5/5 first submission for a fresh concept; assert returned `mastery_level = "developing"` and `mastery_score ≈ 0.69`.
- Manual: student account, take one weekly quiz → `/student/home` heatmap shows "Developing", not "Expert".
- Regression: an existing student with many submissions retains "expert" after backfill.
