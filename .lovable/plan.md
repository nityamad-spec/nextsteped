# Remove reasoning follow-up questions from weekly quizzes

Fully roll back the reasoning follow-up feature: generation, delivery, storage, mastery weighting, analytics, and database schema. Weekly quizzes go back to plain primary questions only, and generation gets substantially faster because the extra AI sub-pass per tier disappears.

## What changes for users

- Weekly quizzes show only the main question — no "why is this correct?" follow-up after a correct answer.
- Quiz generation for professors runs noticeably faster (one AI pass per tier instead of two).
- The "Reasoning Follow-up" analytics panel disappears from the teacher assessment analytics page and the admin course profile.
- Mastery is scored purely on primary-question correctness again.

## Data cleanup (one-time)

- No follow-up questions currently exist in the question bank (0 rows), so nothing to delete there — the cleanup step stays in the migration as a safeguard in case rows are added before it runs.
- About 2,417 past quiz result records carry reasoning fields inside their stored answers; those keys get stripped so historical records contain only primary-answer data.

## Technical steps

1. **Generation** — `supabase/functions/generate-weekly-quiz/index.ts`: delete the follow-up sub-pass (`runFollowupPass`, follow-up prompt/schema, budget guard, coverage/demotion selection, two-stage linked insert). Restore a single-stage insert of primaries. Delete `followup.ts` and `followup_test.ts`.
2. **Delivery** — `WeeklyQuizDialog.tsx`: drop the reasoning row fetch, `followupsByParentId` state, and the primary/reasoning row split. `AssessmentView.tsx`: remove `followupsByParentId` prop, follow-up answer/correctness state, inline follow-up UI, next-button lock, and the `reasoning_*` fields on submitted answers. Update `WeeklyQuizDialog.test.tsx` accordingly.
3. **Mastery** — `update-mastery/mastery.ts`: remove `reasoningAdjustedContribution`, `REASONING_BOOST_FRACTION`, `REASONING_PENALTY_FRACTION`; `index.ts` reverts to plain correct/attempted accumulation. Same removal in `src/lib/masteryScoring.ts` and its tests, plus the `reasoning_correct` field passed from `WeeklyQuizDialog`.
4. **Analytics** — delete `src/components/analytics/ReasoningFollowupAnalytics.tsx`, its usage in `AssessmentAnalytics.tsx`, and the reasoning block in `CourseProfileDialog.tsx`.
5. **Migration** — delete any `question_role = 'reasoning'` rows; strip `reasoning_question_id`, `reasoning_selected`, `reasoning_correct`, `reasoning_is_correct`, `reasoning_bloom` from every element of `assessment_results.answers`; drop the follow-up constraints/index, then drop `parent_question_id` and `question_role` from `assessment_questions`; drop `public.reasoning_followup_analytics(uuid)`.
6. **Verify** — regenerate types, run `bun x vitest run` and the Deno tests for `generate-weekly-quiz` / `update-mastery`, and redeploy the two edge functions.

## Risks

- The answers-JSON rewrite touches ~2.4k rows and is irreversible; it runs as a single statement rebuilding each answers array without the reasoning keys.
- Dropping `parent_question_id` removes any future linked-question hook; re-adding it later needs a new migration.
- Type regeneration after the migration will surface compile errors anywhere a removed column is still referenced — those are resolved in the same pass.
