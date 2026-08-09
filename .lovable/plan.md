# Short-Answer Questions — Phase 2: `grade-short-answer` edge function

Scope: a single backend service that receives one short-answer response with full context, decides accepted / rejected, and writes the grade onto the row the caller already created. No UI, no caller wiring, no generation changes.

Decisions locked from your answers:
- The caller inserts the student's response row; this function only writes the grade fields.
- Graded per question, as the student answers — `source_result_id` may still be null.
- A normalised exact match against the model answer accepts instantly, with no AI call.
- On AI failure: one retry, then the row is left ungraded (verdict null) rather than erroring.

## What the function does

1. **Auth** — student bearer token, validated the same way `evaluate-reasoning` does. No JWT, no service.
2. **Validate input** — Zod schema, 400 with field errors on failure. One item per call (array accepted, capped at 12, so a later batched submit path needs no rewrite).
3. **Locate the row** — find the caller's response row by `(student_id from the token, question_id, response_kind='short_answer')`, newest first, scoped to `source_result_id` when supplied. If no row exists, return 404 `response_row_not_found`; the function never creates one.
4. **Deterministic pre-check** — normalise both sides (lowercase, collapse whitespace, strip surrounding punctuation) and compare the student's text against `answer` and `model_answer`. A match accepts immediately with a fixed feedback string and no gateway call.
5. **AI grade** — otherwise one `google/gemini-3.1-flash-lite` call through `loggedGatewayFetch` with a strict JSON schema returning `{ verdict, feedback, model_reasoning }`. 15s timeout, one retry with a short backoff on timeout / 5xx / 429.
6. **Persist** — service-role update of `ai_verdict`, `ai_feedback`, `ai_model_reasoning`, `ai_evaluated_at`, and `model_answer_snapshot` (the reference answer actually compared against). Only writes when the row's grade fields are still null, so a double call can't overwrite a landed grade.
7. **Respond** — `{ question_id, verdict, feedback, model_reasoning, graded_by: "exact_match" | "model" | null }`. A null verdict means ungraded; the caller treats it as a non-error.

## Files

- `supabase/functions/grade-short-answer/index.ts` — auth, validation, row lookup, orchestration, persistence.
- `supabase/functions/grade-short-answer/grade.ts` — pure helpers: `normalizeAnswer`, `exactMatch`, `SYSTEM_PROMPT`, `buildUserPrompt`, `RESPONSE_FORMAT`, `parseGrade`. Mirrors the `evaluate-reasoning/parse.ts` split so it is unit-testable without booting Deno.serve.
- `supabase/functions/grade-short-answer/grade_test.ts` — Deno tests for normalisation, exact-match hits and misses, strict-JSON parse, malformed / fenced / empty model output, and unknown verdict → null.

## Grading prompt

The model is told it is grading **correctness of a free-text answer against a reference answer**, not the quality of reasoning — deliberately different from `evaluate-reasoning`, which judges rationale quality. It receives the question, concept, Bloom level, reference answer (`model_answer` falling back to `answer`), and the student's text. Binary verdict, feedback under 40 words, `model_reasoning` carrying the correct answer explained so the student learns from a rejection. Temperature 0.2 for stability.

## Improvements worth taking

- **Snapshot the reference answer on the graded row** — already a Phase 1 column; write it here so a later edit to the question never invalidates a past grade.
- **Idempotent update guard** (`ai_verdict is null`) — cheap protection against duplicate calls from retries or double-taps, given rows can't be deleted.
- **Record `graded_by` in the gateway log context** so the exact-match hit rate is measurable and the cost saving is visible.
- **Accept an array now** — the per-question path sends one item, but the batched submit path in a later phase needs no new contract.
- **Never surface 429/402 as a hard error** — return verdict null with the reason in the payload so the student is never blocked mid-test.

## Risks and constraints

- **Insert-only table, updated by service role.** RLS blocks student updates; the function's service-role write bypasses that. The `ai_verdict is null` guard is the only thing preventing a grade being rewritten, so it must not be dropped later.
- **Exact match can be wrong.** A normalised match against a one-word reference is safe; against a sentence-long `model_answer` it will rarely fire and is harmless. But an answer that matches a *distractor*-style reference is not checked — the pre-check only ever accepts, never rejects, which keeps the failure mode generous rather than punitive.
- **Grading before submit means `source_result_id` is null**, so the Phase 1 partial unique index (which only covers rows with a result id) does not protect these rows. Duplicate answer rows inserted by a caller would each be graded separately; the row-lookup takes the newest, so the older duplicate stays ungraded.
- **Latency and cost scale with question count.** Eight short answers is eight calls. Acceptable while grading is per-question and backgrounded; a quiz with many short answers plus a slow network will leave some rows ungraded until a later batch pass exists.
- **Verdict vocabulary stays overloaded.** `accepted` means "correct" on a `short_answer` row and "sound reasoning" on a `reasoning` row. Any consumer counting verdicts must filter on `response_kind` — the scoring paths in `reasoning.ts` and `masteryScoring.ts` are the ones to audit when Phase 6 lands.
- **No regrade path.** A wrong grade is permanent under the insert-only decision; the only remedy remains voiding the attempt.

## Out of scope

- Caller/UI wiring, the free-text input, and the review screen.
- Scoring, mastery, and analytics consumption of the grade.
- Short-answer question generation and the per-format mix settings.
