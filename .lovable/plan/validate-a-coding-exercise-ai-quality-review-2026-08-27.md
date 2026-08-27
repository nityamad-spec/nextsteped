# Validate a coding exercise (AI quality review)

On `/teacher/setup/lesson-plan`, each coding/lab week exercise row gets a **Validate** button. It runs an AI quality review of that one exercise and shows a progress bar that ticks through the individual checks (problem statement, input spec, output spec, constraints, examples, test cases). Results are advisory — publishing stays gated by review + required fields exactly as today.

## What the professor sees

- A **Validate** button on each exercise row in the Coding exercises section, and the same button inside the exercise dialog.
- While running: an inline progress bar with the current check name ("Checking output specification…") and a step counter (e.g. 3 of 6).
- When done: a compact report under the row — one line per check with pass / warning / fail plus a short AI note, and an overall badge ("Validated", "2 warnings", "1 issue").
- The last result persists, with a "Validated <time>" label. Editing the exercise clears the stored result (the report no longer matches the content).
- Nothing blocks publish; the report is guidance only.

## Checks performed

1. **Problem statement** — self-contained, unambiguous, states the task without relying on the title.
2. **Input specification** — every value the program reads is described, order and types are clear.
3. **Output specification** — exact expected format described, matches the examples.
4. **Constraints** — bounds present and consistent with the examples/test cases (flagged as a warning, not a failure, when genuinely not applicable).
5. **Examples** — each example's output is consistent with the stated specs and constraints.
6. **Test cases** — standard + hidden test inputs conform to the input spec, expected outputs match the reference solution's described behaviour, and edge cases are covered.

Each check returns `pass | warning | fail` plus one sentence of justification.

## Technical plan

**Edge function `validate-coding-exercise`** (new), modeled on `generate-coding-exercises`:

- Auth: Bearer token → `auth.getClaims`; caller must be a course member (`is_course_member`). Input: `{ exercise_id }`, Zod-validated.
- Loads the exercise plus its `coding_exercise_private` row (reference solution + hidden tests) with the service-role client after the membership check.
- Runs the six checks as sequential AI gateway calls (one check per call, so the client can report real per-check progress) using `openai/gpt-5.4-mini` via `/v1/chat/completions` with a strict tool/JSON schema (`status`, `note`), through `loggedGatewayFetch` from `_shared/ai-log.ts`.
- Streams NDJSON exactly like the generator: `{type:"progress", step, total, check, status?, note?}` per finished check, `heartbeat` frames while a call is in flight, and a final `{type:"result", payload:{checks:[…], overall}}` or `{type:"error"}`.
- Gateway errors follow the shared semantics: 429/5xx retried once with backoff, other statuses surfaced verbatim as the error frame.

**Database (migration)** — persist the report where students can never read it:

- Add `validation_report jsonb` and `validated_at timestamptz` to `coding_exercise_private` (teacher/admin RLS already; no new grants needed beyond the existing ones on that table).
- No change to `coding_exercises`, so nothing new is exposed to students.

**Client**

- `src/lib/codingExercises.ts`: add the `ValidationCheck` / `ValidationReport` types, a `CODING_VALIDATION_CHECKS` list (ids + labels + order, shared with the edge function's check ids), `summariseValidation(report)` returning the overall badge state, and include `validation_report` / `validated_at` in `fetchWeekExercises`'s private join. `updateExercise` also nulls both fields, so an edit invalidates the report (same rule as `reviewed_at`).
- `src/components/teacher/CodingExercisesSection.tsx`: per-exercise `validatingId` + `progress` state, an NDJSON reader (reuse the generation reader's parsing shape), the Validate button, the shadcn `Progress` bar with the current check label, and the results list.
- `src/components/teacher/CodingExerciseDialog.tsx`: same Validate action in the dialog footer so review and validation happen in one place.

**Tests**

- `codingExercises.test.ts`: `summariseValidation` (all pass / warnings / fails / empty), edit-clears-report behaviour, check-list ordering.
- `CodingExercisesSection.test.tsx`: Validate button renders per exercise, progress bar advances as progress frames arrive (mocked fetch stream), report renders, publish remains unaffected by a failing report.
- Edge: 401 unauthenticated, 403 non-member, 404 unknown exercise.

## Risks / constraints

- **AI judgement is advisory and non-deterministic** — two runs can disagree on a borderline "warning". The UI copy should say this is an AI review, not a correctness proof.
- **No code execution** — Judge0 is still not wired up, so "expected output matches the reference solution" is a reasoned check by the model reading the code, not an executed one. This is the same limitation the generator has.
- **Cost/latency** — six sequential gateway calls per exercise (roughly 20–60s). Per-exercise scope keeps this bounded; a week-level "validate all" is deliberately out of scope for now.
- **Reports go stale** — solved by clearing them on edit; a stale report is worse than none.
- **Reference solutions must not leak** — the report lives in `coding_exercise_private`, and the check notes are written to describe issues without quoting solution code.
