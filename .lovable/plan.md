# Fix: weekly quiz tiers producing duplicate questions

## Root cause

`supabase/functions/generate-weekly-quiz/index.ts` generates all four tiers (standard, easy, medium, hard) **in parallel** via `Promise.allSettled` (line 719). Each tier's prompt (line 431) only shows the model "EXISTING QUESTIONS IN THIS SAME TIER" — there is zero cross-tier awareness. On a small-concept week (e.g. Google Cloud Infra W1), the model naturally picks the same "most obvious" questions for standard and easy, and nothing rejects them.

`validateTierQuestionSet` (line 266) also runs per-tier only, so cross-tier duplicates survive.

## Fix

Two changes, both inside `supabase/functions/generate-weekly-quiz/index.ts`. No frontend or schema changes.

### 1. Sequence standard first, then run easy/medium/hard in parallel with standard as forbidden context

- Run `generateTier` for **standard** first and await it.
- Then run **easy, medium, hard** with `Promise.allSettled` as today, but pass the accepted standard questions into `generateTier` as an additional "cross-tier avoid" list.
- Update `generateTier` signature to accept `crossTierAvoid: GeneratedQuestion[]` and merge it into the prompt via a new `formatCrossTierAvoidForPrompt(...)` helper that renders:
  > "QUESTIONS ALREADY USED IN THE STANDARD TIER OF THIS SAME QUIZ — do NOT repeat, paraphrase, or test the same fact/application. Choose different concepts or different angles on the same concept."
- Inside `generateTier`, also feed `crossTierAvoid` into the same-tier `isLikelyDuplicateQuestion` check when validating incoming candidates, so any accidental collision is rejected before it's kept.

Wall-clock impact: standard tier adds ~15-30s (the other three still run in parallel). Well within the 130s global deadline. If standard fails outright, fall back to the current all-parallel behavior so we never zero out the whole quiz.

### 2. Post-assembly cross-tier dedup + tier-priority resolution

Before insert (around line 774), run a final pass over `allQuestions`:

- Iterate in tier priority order **standard → hard → medium → easy** (standard is canonical; easy is most likely to be the offender).
- Use existing `isLikelyDuplicateQuestion` against everything already kept.
- Drop losers, log which tier/stem was dropped into `tier_errors[<tier>] += "dropped N cross-tier duplicates"`.
- Allow the response to be `partial: true` if a tier ends up under 5 after dedup (frontend already handles partials).

## Verification

1. Deploy `generate-weekly-quiz`.
2. On `/teacher/setup/lesson-plan`, regenerate Week 1 for Google Cloud Infra CL01.
3. Open `WeeklyQuizReviewDialog` and confirm standard vs. easy stems and correct answers no longer overlap.
4. Check function logs for any `dropped N cross-tier duplicates` warnings — a small number is expected and fine; zero is ideal.

## Not doing (and why)

- **Fully sequential all four tiers**: would push wall clock past the 130s deadline on slow gateway days.
- **Hard-coded "no same concept across tiers"**: too strict on small-concept weeks where 3 concepts must cover 20 questions — the model needs to reuse concepts, just not restate the same question.
- **Schema change to enforce uniqueness in DB**: overkill; dedup belongs in generation, not as a hard DB constraint that would reject partial quizzes.
