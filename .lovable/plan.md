# Phase 6 — Analytics & admin visibility

Primary-based dashboards stay untouched. Add a new **Reasoning follow-ups** analytics surface that makes fairness/coverage/impact of the Phase 2–5 follow-up loop visible per course.

## Scope

Four signals, one view:

1. **Per-item reasoning correctness** — for each reasoning row (`question_role='reasoning'`), % of student responses that were `reasoning_is_correct = true`, over responses where it was `true|false` (nulls excluded). Table sorted worst-first, with parent stem shown alongside. Rows below a threshold (default 20% correct, min 5 responses) flagged as **Review**.
2. **Coverage rate** — of primary answers with `is_correct=true` on a Bloom-3+ primary, % where the sibling `reasoning_is_correct` is non-null. Split into: shown & answered, no follow-up existed, load-failure/null. Confirms the required-follow-up flow is working and exposes the null-path.
3. **Boost vs penalty distribution** — course-level counts and % of: boost path (primary correct + reasoning correct), penalty path (primary correct + reasoning wrong), neutral (primary wrong, or reasoning null). Net expected mastery impact = `boost_count × R − penalty_count × P` using the Phase 5 constants; shown as an informational figure, not a per-student number.
4. **Generation coverage per quiz** — for each weekly quiz (course × quiz_day), primaries at Bloom ≥ 3 shipped, follow-ups generated, dropped, demoted, and whether the follow-up pass was skipped for budget. Rederived from the DB (see Data model below), no reliance on transient logs.

## Placement

- New tab **"Reasoning follow-ups"** inside `src/pages/teacher/AssessmentAnalytics.tsx`, next to existing exam/diagnostic tabs. Course-scoped via the existing `useTeacherCourseId` context — matches the memory rule for professor course resolution.
- Admin `CourseProfileDialog` gets one small additive tile: **"Follow-up flags: N items <20%"** linking into the professor view. No layout change to existing tiles.

Nothing else moves. `AssessmentAnalytics`'s existing tabs and `CourseAnalyticsView` continue to count primaries only — no regression.

## Data model

No new tables. Signals 1–3 are computed from existing rows:

- `assessment_questions` filtered by `question_role in ('primary','reasoning')`, joined on `parent_question_id`.
- `assessment_results.answers` (jsonb) already carries `reasoning_question_id`, `reasoning_is_correct`, `reasoning_bloom` from Phase 4.

Signal 4 (generation coverage) currently only exists as the `followup_done` NDJSON heartbeat — it's not persisted. To make it visible after the stream closes, persist per-quiz telemetry. Two options — plan asks the user to pick (see Questions):

- **A. New table** `weekly_quiz_generation_stats` (course_id, quiz_day, tier, primaries_shipped, followup_generated, failed_dropped, failed_demoted, skipped_budget, created_at) written at the end of `generate-weekly-quiz`. Cleanest, queryable, small.
- **B. Rederive-only**: skip signal 4's generation counts; infer coverage from `assessment_questions` (Bloom-3+ primaries missing a `reasoning` child = dropped/demoted signal, indistinguishable but usable). No schema change. Loses the "skipped_budget" flag and can't tell drop vs demote apart.

## Query strategy

All aggregates are computed via one SECURITY DEFINER SQL function `public.reasoning_followup_analytics(_course_id uuid)` gated by `is_course_member(_course_id, auth.uid())`, returning three result sets (or one JSON blob):

- `per_item[]`: reasoning_question_id, parent stem preview, concept_code, bloom, attempts, correct, pct, flagged.
- `coverage`: bloom3_correct_primary_answers, followup_answered, no_followup_exists, followup_null.
- `impact`: boost_count, penalty_count, neutral_count, expected_mastery_delta.

Client hits it once per view load (with the existing cache pattern), no N+1 over primaries. Realtime subscription reuses the `assessment_results` channel already in `CourseAnalyticsView`.

## Config

Add to `MASTERY_CONFIG` (re-exported) or a new `analytics.ts` const block:

```
REASONING_REVIEW_MIN_CORRECT_PCT = 0.20
REASONING_REVIEW_MIN_ATTEMPTS    = 5
```

Kept as code constants (not `admin_settings`) unless the user wants runtime tuning — see Questions.

## Privacy

Per-item rates are aggregate counts, not per-student — consistent with the "students anonymized for professors" memory. No student identifiers appear in any of the four signals.

## Risks & constraints

- **Signal 4 is only meaningful if we persist Phase 2 telemetry.** Option B leaves a partial view.
- `**answers` jsonb queries** are unindexed. Course-scoped filters keep result sets small (≤ a few thousand rows per course), and we compute in the SQL function server-side, but very large courses may want a `GIN` index on `assessment_results.answers` later. Not adding it now — premature.
- **Threshold tuning.** 20% / 5 attempts is a first guess. Once real data lands, the professor view will drive whether we raise the min-attempts floor.
- **Fairness dependency.** Phase 5 penalties are already live per your last approval; shipping this view is the feedback loop for tuning `REASONING_PENALTY_FRACTION`. Without it we're penalising blind.
- **No new privileges.** The SQL function reuses `is_course_member`; RLS on the underlying tables is unchanged.

## Steps

1. **(Optional, depends on Q1)** Migration: create `weekly_quiz_generation_stats` with `GRANT`s to `authenticated` (SELECT only) + `service_role` (ALL), RLS scoped to `is_course_member`.
2. **(Optional, depends on Q1)** `generate-weekly-quiz`: after the follow-up pass, upsert one row per tier with the telemetry it already computes. No behaviour change.
3. Migration: `public.reasoning_followup_analytics(_course_id uuid)` SECURITY DEFINER function returning the three aggregates as JSON, plus `GRANT EXECUTE` to `authenticated`.
4. New component `src/components/analytics/ReasoningFollowupAnalytics.tsx`: three sections (Per-item table with Review flag, Coverage card, Impact card) + optional Generation card if Q1=A.
5. Wire as new tab in `src/pages/teacher/AssessmentAnalytics.tsx`.
6. Small "Follow-up flags" tile in `src/components/admin/CourseProfileDialog.tsx`.
7. Typecheck; smoke-verify against a course with existing Phase 4 quiz data if any exists.

## Questions

1. Persist Phase 2 generation telemetry - skip it and infer from `assessment_questions` only (Option B, no drop-vs-demote distinction, no skipped_budget)?
2. Review threshold — keep hardcoded `<20% correct, ≥5 attempts`
3. Admin-portal tile: single "flags count" chip on `CourseProfileDialog` (proposed)
4. Realtime updates on the new tab, or a manual "Refresh" button only