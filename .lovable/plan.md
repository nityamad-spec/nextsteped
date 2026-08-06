# Phase 4 — Verify centralized AI gateway logging

Goal: prove the shared logger writes correct rows for real calls, with no code changes unless verification fails.

## Steps

1. Deploy
   - Re-deploy the 17 instrumented functions (already deployed once; re-deploy to be sure the current `_shared/ai-log.ts` is bundled into each).

2. Real generation call — weekly quiz top-up
   - Invoke `generate-weekly-quiz` with `top_up: true` for a course/week that is short of questions.
   - Expect one `ai_gateway_call_log` row per gateway attempt with `function_name = generate-weekly-quiz`, `purpose = weekly-quiz:<tier>`, non-null `duration_ms`, `http_status = 200`, `outcome = success`, and `attempt` set.

3. Real setup call — quality check
   - Invoke `quality-check` on an existing course's syllabus.
   - Expect a row with `function_name = quality-check`, `purpose = quality-check`, model, duration, and outcome.

4. Confirm rows
   - Query `ai_gateway_call_log` ordered by `created_at desc` and check the two calls above landed with sane values (no null outcome, duration > 0, correct purpose strings).
   - Open the admin AI Gateway Calls tab (`AiGatewayCallsTab.tsx`) and confirm the same rows render with function, model, purpose, status, and duration columns populated.

5. Tests
   - Run the existing Deno tests that cover touched code: `_shared/question-validation_test.ts`, `_shared/rag-retrieve_test.ts`, `_shared/chat-grounding_test.ts`, `_shared/sanitizer_*`, and `update-mastery/*`.
   - Report results. Per project rule, failures are reported and not auto-fixed without approval.

## Notes and risks

- Logging is fire-and-forget via `EdgeRuntime.waitUntil`; a row can lag a second or two behind the response. Re-query rather than concluding it is missing.
- The weekly quiz top-up needs a course/week with a real shortfall, otherwise no gateway call fires and there is nothing to verify.
- The pre-existing typecheck errors in `generate-diagnostic-questions`, `generate-practice-questions`, and `generate-teaching-insights` are unrelated to this phase and stay untouched.
- No schema changes in this phase.

## Question

Which course (and week) should I use for the weekly-quiz top-up and quality-check calls? If you'd rather I pick, I'll choose a course that currently has a question shortfall.
