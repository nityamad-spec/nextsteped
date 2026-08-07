# AI evaluation of student reasoning

Today the "Explain your reasoning" textarea on Bloom 3+ questions is captured and stored verbatim, with no judgement of quality. This adds an AI evaluation step: when the student advances past such a question, the rationale is sent to Gemini Flash Lite, which accepts or rejects it and returns the correct semantic reasoning. The verdict is shown inline right away, held in browser memory with the rest of the attempt, and saved with the attempt on submission.

Confirmed behaviour:
- The verdict and model explanation are shown inline immediately after the student clicks Next.
- A rejected rationale never blocks the student — it is recorded only.
- On failure/timeout: one automatic retry, then advance with the verdict left unevaluated.
- No effect on score, mastery, or level in this phase.

## How it behaves for the student

1. Student answers a Bloom 3+ question and writes their reasoning (still mandatory, 15-char minimum, unchanged).
2. They click Next. The evaluation is fired immediately and the student moves on — no waiting.
3. A small result panel appears for that question showing "Reasoning accepted" or "Reasoning needs work", plus the model's short explanation of the correct reasoning. It stays available when the student navigates back to that question and on the review screen.
4. On final submit, if any evaluation is still in flight (typically the last question), a brief "Checking your reasoning…" state holds the submit button until it settles or a hard deadline passes; the attempt is then saved with whatever verdicts exist.

## Suggested improvements to the proposed approach

- **Fire on Next, don't wait on Next.** Blocking navigation for a model call makes the test feel broken on slow networks. Firing in the background and rendering the verdict when it lands gives the same teaching moment with none of the stalling.
- **Hard deadline on final submit.** Never let a pending evaluation prevent an attempt from being saved. Cap the wait (about 8 seconds), then submit with those verdicts null.
- **Save the attempt first, verdicts second.** The result row is written as it is today; rationale rows carry the verdicts. A failed evaluation can never cost a student their quiz attempt.
- **De-duplicate.** Re-evaluate only if the text actually changed since the last evaluation for that question, so back-and-forth navigation doesn't burn repeated calls.
- **One call per question, batched fallback.** If a student's evaluations are still pending at submit, send the remaining ones as a single batched request rather than several parallel calls.
- **Rejection wording matters.** Phrase rejection as "needs work / here's the stronger reasoning" rather than "wrong", since it carries no scoring weight and is purely formative.

## Phases

1. **Edge function** — new `evaluate-reasoning` function: authenticated student call, validated body (question text, options, correct answer, student's selected answer, concept, bloom level, rationale text), single Gemini Flash Lite call returning strict JSON `{ verdict: "accepted" | "rejected", feedback: string, model_reasoning: string }`. Uses the shared `loggedGatewayFetch` logging helper. Accepts either a single item or an array for the batched submit path.
2. **Data model** — add `ai_verdict` (text, nullable), `ai_feedback` (text, nullable), `ai_model_reasoning` (text, nullable) and `ai_evaluated_at` (timestamptz, nullable) to `student_answer_rationales`. Nullable means unevaluated; existing rows are unaffected.
3. **Client evaluation layer** — extend `useReasoningAnswers` with an evaluations map (`questionId -> { status, verdict, feedback, modelReasoning }`), an `evaluate(question)` trigger, dedupe on unchanged text, one retry with backoff, and a `waitForPending(deadlineMs)` helper for submit.
4. **UI** — a `ReasoningVerdict` panel under `ReasoningInput` showing pending / accepted / needs-work / unevaluated states; a "Checking your reasoning…" submit state driven by `waitForPending`.
5. **Wire the four formats** — `AssessmentView` (weekly quiz + exam prep), `DiagnosticQuiz`, `PracticeQuestionsWidget`: call `evaluate` on the Next/advance handler, await `waitForPending` before submit, and pass the verdict fields through `buildReasoningRows`.
6. **Teacher/admin visibility** — surface verdict and feedback alongside the existing rationale display in assessment analytics, plus an accepted-rate figure per concept.
7. **Tests** — unit tests for dedupe, retry-then-advance, and deadline expiry in the evaluation hook; a Deno test for the edge function's JSON contract and malformed-response handling.

## Technical notes

- Model: `google/gemini-3.1-flash-lite` via the Lovable AI Gateway, with a strict JSON schema response and a short output cap to keep latency near a second.
- The prompt gives the model the question, the correct answer, the student's answer and their rationale, and asks it to judge whether the rationale demonstrates correct understanding of *why* the answer holds — not whether the answer itself was right.
- Correct answers with wrong reasoning, and wrong answers with partially sound reasoning, are both evaluated; the verdict is independent of `is_correct`, which stays as it is today.
- Timed formats auto-submit on timeout; that path skips waiting entirely and stores whatever verdicts have already landed.
- 429/402 gateway errors are surfaced as an "unevaluated" state, never as an error toast mid-test.

## Out of scope

- Any effect on score, mastery, level, or the adaptive tier selection.
- Re-evaluating historical rationale rows already in the database.
