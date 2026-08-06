# Shared AI gateway logging helper

Extract the one-off logger that lives inside `generate-diagnostic-questions` into a single shared module and use it from every backend function that calls the AI gateway — except the student and professor chat paths.

## Goal

One helper, one row shape, one place to change. Every non-chat AI call leaves a persistent, queryable trace in `ai_gateway_call_log`, so the existing admin AI Gateway Calls tab stops being fed by a single function.

## What gets logged

No schema change. The existing `ai_gateway_call_log` columns stay exactly as they are: function name, model, purpose, HTTP status, outcome, attempt / total attempts, duration, request id, teacher id, course id, error code, truncated error message, and a free-form `context` object.

## Scope

Logging added to these functions (19 call sites):

- Question generation: `generate-weekly-quiz`, `generate-exam-questions`, `generate-practice-questions`, `generate-question-metadata`, `explain-answers`
- Course setup: `parse-syllabus`, `quality-check`, `generate-lesson-plan` (3 calls), `regenerate-lesson-plan-week`, `extract-lesson-plan`, `suggest-lesson`, `suggest-concepts`, `recommend-additional-concepts`, `extract-youtube-links`
- Analytics / ingestion: `generate-teaching-insights`, `ingest-rag-document` (2 calls: OCR + embeddings)
- Already logging, switches to the shared helper: `generate-diagnostic-questions`

Explicitly **not** logged (per request):

- `chat` — student TA and professor Course Assistant
- `classify-question` — runs only as part of the student chat turn, so logging it would log chat traffic by the back door
- `_shared/rag-retrieve.ts` — the embedding call is invoked from the chat path; it stays silent for now to avoid partially logging chat

## Phases

**Phase 1 — Create the shared module**
`supabase/functions/_shared/ai-log.ts` exporting:
- `classifyOutcome(status, error)` — unchanged logic (2xx ok, 429/5xx retryable, other 4xx client error, abort/timeout, network error)
- `logGatewayCall(functionName, row)` — same payload build, same 500-char error truncation, same service-role client (lazily created, cached per isolate), same fire-and-forget write wrapped in `EdgeRuntime.waitUntil`, same swallow-and-console-error on failure

**Phase 2 — Migrate the existing user**
Delete the ~90 local lines in `generate-diagnostic-questions/index.ts` and import from `_shared/ai-log.ts`. Its 6 call sites keep identical behaviour — this is the regression check that the extraction is faithful.

**Phase 3 — Instrument the remaining functions**
For each function in scope, wrap the gateway `fetch` with: start timestamp, one log call on success (`ok`, with status and duration), one on non-2xx (status, `error_code`, truncated body), one in the catch (`timeout` / `network_error`). Where a function already retries per tier or per pass (weekly quiz, exam questions), log each attempt with `attempt` / `total_attempts` so a partial failure is visible per attempt rather than collapsed into one row.

Fields populated where already in hand at the call site: `purpose` (a stable short label per call site, e.g. `weekly-quiz:hard-tier`, `lesson-plan:week-regen`), `model`, `teacher_id`, `course_id`, and a small `context` object with whatever the function already computes (week number, tier, file id, question counts).

**Phase 4 — Verify**
Deploy the touched functions, run one real generation (weekly quiz top-up) and one setup call (quality check), then confirm the rows land with correct outcome, duration, and purpose in the admin AI Gateway Calls tab. Run the existing Deno tests for the touched functions.

## Risks and constraints

- **Behaviour drift during extraction.** The helper must remain fire-and-forget and never throw into the request path — a logging failure must not fail a generation. Phase 2 exists specifically to prove the extracted version behaves like the original before it spreads.
- **Service role availability.** The helper needs `SUPABASE_URL` and the service role key; if either is missing it silently no-ops, exactly as today. Functions that currently do not create a service-role client will now create one lazily — no extra cost when the key is absent.
- **Row volume.** Adding ~19 call sites will multiply log volume, and the table has no retention policy today. This plan does not add one; growth should be watched, and a purge job is a natural follow-up.
- **No payload capture.** Prompts and responses are still not stored, so a failure remains diagnosable by status/error only. Deliberate — payload capture is a separate decision with privacy implications.
- **PII.** `error_message` is truncated but comes from provider text; it is already admin-only via RLS and that stays unchanged.
- **Deploy blast radius.** Roughly 18 edge functions get redeployed. Each change is additive around an existing fetch, so the risk is low, but they should be deployed and smoke-checked in the grouped batches above rather than all at once.
