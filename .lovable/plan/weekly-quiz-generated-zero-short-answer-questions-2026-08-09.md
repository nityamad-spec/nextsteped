# Weekly quiz generated zero short-answer questions

## What the data shows

The regeneration at 16:20 UTC for week 1 stored 20 questions: 12 multiple choice, 8 true/false, 0 short answer. That is the old MCQ/true-false pattern (3 MCQ + 2 T/F per tier), not the new 40/40/20 mix (which would be roughly 2 MCQ, 2 short answer, 1 T/F per tier).

Every lesson-plan week currently has an empty `quiz_type_counts`, which is expected — empty falls back to the 40/40/20 default, so the mix being unset is not the cause.

The generator source already reads the week mix, converts it to per-tier format quotas, asks the model for short answers, validates them, and writes `model_answer` / `answer_max_words`. So the source is correct; the run that produced these questions did not behave like that source.

Most likely cause (unconfirmed): the run executed against the previously deployed version of the function, before the short-answer changes went live. Second possibility: the model ignored the "produce approximately" quota wording and every short-answer candidate was rejected by validation. Today's logs cannot distinguish these, because the run summary logs counts per tier only — never per format, and never the rejection reasons for short answers.

## Plan

1. Make the diagnosis possible. Extend the weekly-quiz run logging so each tier reports the format quota it was given, the format counts it actually accepted, and the rejection reasons grouped by format. Add the overall format breakdown to the final `[weekly-quiz]` summary line.
2. Re-run generation for the same week and read the new logs. If the quota line appears at all, the new code is live and the problem is model/validation behaviour; if it does not appear, the earlier run simply predated the deployment and a fresh regeneration fixes it.
3. If it turns out to be model/validation behaviour, tighten the generation loop:
   - State the format quota as an exact requirement rather than "approximately", and repeat the owed short-answer count in the retry hint when short answers are still missing.
   - Reserve capacity: stop accepting MCQ and true/false once their quota is met even on the final attempt, as long as short answers are still owed and attempt budget remains.
   - Relax the strictest short-answer validators if they are what is rejecting items (the ≤30-word reference answer and the ≥20-character model answer are the likeliest offenders).
4. Confirm end to end: regenerate a week, verify the stored rows include short-answer items with a populated `model_answer` and `answer_max_words`, and open the quiz as a student to confirm the answer box renders and background grading fires.

## Technical notes

- Files touched: `supabase/functions/generate-weekly-quiz/index.ts` only (logging, prompt wording, quota enforcement). No database or UI changes.
- No migration needed — `quiz_type_counts`, `model_answer` and `answer_max_words` all already exist.
- Existing weekly quizzes are unaffected until each week is regenerated individually.
