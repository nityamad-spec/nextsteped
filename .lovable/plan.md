## Goal

Add a standardized long-form header comment at the top of every `supabase/functions/*/index.ts` file describing the function's purpose and its behavior as an incremental numbered list of steps.

## Scope

All edge functions under `supabase/functions/` (excluding `_shared/`):

- approve-teacher, chat, classify-question, complete-student-signup, delete-course, delete-user, enroll-additional-course, explain-answers, extract-lesson-plan, extract-youtube-links, generate-diagnostic-questions, generate-exam-questions, generate-lesson-plan, generate-practice-questions, generate-question-metadata, generate-teaching-insights, generate-weekly-quiz, parse-syllabus, quality-check, recommend-additional-concepts, regenerate-lesson-plan-week, resend-teacher-invite, score-diagnostic, seed-admin, seed-concepts, seed-questions, student-pending-signup, student-signin, student-signup, suggest-concepts, suggest-lesson, transfer-course-ownership, update-mastery, validate-enrollment-code, wipe-courses, wipe-syllabus-cascade

## Comment Format

Placed at the very top of each `index.ts`, above imports:

```text
/**
 * <function-name>
 *
 * Purpose:
 *   <1–2 sentence summary of what this function does and when it's called.>
 *
 * Auth / Access:
 *   <who can invoke; JWT verification; role checks (admin/teacher/student/public).>
 *
 * Inputs:
 *   - <field>: <type> — <description>
 *
 * Outputs:
 *   - <shape returned on success> / <error shapes>
 *
 * Steps:
 *   1. <first thing it does — parse/validate>
 *   2. <auth/role check>
 *   3. <DB reads>
 *   4. <core logic / AI call / computation>
 *   5. <DB writes / side effects>
 *   6. <response>
 *
 * Side effects:
 *   - <tables written, cache bumps, emails sent, auth users created, etc.>
 *
 * External calls:
 *   - <Lovable AI Gateway model, Supabase admin API, etc.>
 */
```

Sections that don't apply to a given function (e.g. no side effects) are omitted rather than left blank.

## Approach

- Read each function's `index.ts` and derive the steps from actual code — no invented behavior.
- Insert only the header comment. Do NOT change any logic, imports, types, CORS, validation, or responses.
- Preserve existing top-of-file comments if any (merge into the new header).
- Keep each header concise (roughly 15–35 lines); the numbered `Steps` list is the required "incremental listed format".

## Out of Scope

- No changes to `_shared/` helpers (not edge functions).
- No refactors, no behavior changes, no test additions.
- No changes to `supabase/config.toml`.
- Frontend code untouched.

## Execution

Batch the reads and writes in parallel groups (roughly 6–8 functions per batch) to keep turns efficient. After all files are updated, do a quick `rg` sanity check that every `supabase/functions/*/index.ts` begins with the new header block.
