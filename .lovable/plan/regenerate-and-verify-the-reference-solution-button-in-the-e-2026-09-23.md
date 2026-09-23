# Regenerate and verify the reference solution (button in the exercise dialog)

Add a **Regenerate solution** button next to the Reference solution box in the coding exercise dialog on `/teacher/setup/lesson-plan`. Pressing it writes a brand-new solution from the exercise's specs, runs it for real against every example and test case, and has AI check it follows the input/output format and constraints. The professor sees the result and chooses **Use this solution** or **Discard**. The current solution is never replaced silently.

## What the professor sees

1. Click **Regenerate solution** (disabled with a reason if the problem statement, input spec or output spec is empty).
2. A progress bar walks through: Writing solution -> Running examples -> Running standard tests -> Running hidden tests -> Checking format and constraints.
3. A result panel shows:
   - The new code (read-only preview, side by side with the current one).
   - "X of Y cases passed" with the same per-case details as "Run test cases" today.
   - AI checks: reads input exactly as specified, prints output exactly as specified, respects constraints, no extra prompts/prints, uses only what the course allows. Each pass / warning / fail with one sentence.
   - Overall badge: Verified (all cases pass, no fails), Needs review, or Failed.
4. If cases fail, the generator gets one automatic retry with the failing cases as feedback before showing the result.
5. **Use this solution** puts it in the box (still unsaved until the dialog's normal Save; saving clears review as today). **Discard** leaves everything as it was.

## Context given to the AI when writing the solution

- Language and the exact runtime version run by the code runner (Python 3.8, C++ GCC 9, Java 13, Node 12) so it avoids newer syntax.
- Title, problem statement, input spec, output spec, constraints.
- All examples (input + expected output) and all standard and hidden test cases.
- Starter code, so the solution keeps the same structure/function names.
- Week topic and concepts covered, so it only uses what students have learned.
- Strict rules: read from standard input only, no input prompts, print nothing but the answer, match output format exactly (spacing, casing, line breaks), handle every constraint bound, no placeholder comments, complete runnable program.
- On retry: the failing cases with expected vs actual output and any error message.

## Technical details

**New edge function `regenerate-reference-solution`**
- Auth via Bearer token; caller must be a course member (`is_course_member`). Input `{ exercise_id, draft }` (Zod) — draft carries the dialog's current unsaved fields so edits in progress are respected; private fields loaded server-side only if absent.
- Generation: `openai/gpt-6-astra` on `/v1/responses`, streamed, reasoning effort `medium`, strict JSON schema `{ solution, notes }`, via `loggedGatewayFetch`.
- Execution: reuse the `run-code` Judge0 logic (extract to `_shared/judge0.ts`, used by both), concurrency 2, same normalised output comparison as `normalizeOutput`/`outputsMatch` (ported to `_shared`).
- One retry with failing-case feedback if any case fails.
- AI format/constraints review: a second streamed call with a strict schema of checks `{ id, status, note }`; notes must not quote solution code.
- Streams NDJSON progress frames like `validate-coding-exercise` (`progress`, `heartbeat`, `result`, `error`). Gateway errors: only 429/5xx retried once with backoff; 402/403 surfaced as-is.
- Nothing is written to the database; the solution only lands when the professor accepts and saves.

**Client**
- `src/lib/codingExercises.ts`: `ReferenceRegenResult` type, `SOLUTION_CHECKS` list, `summariseRegen()`, `canRegenerateSolution(draft)` + blocked reason.
- `src/components/teacher/CodingExerciseDialog.tsx`: button, NDJSON reader (same shape as the Validate reader), progress bar, result panel with Use / Discard.

**Tests**
- Unit: `canRegenerateSolution`, `summariseRegen` (verified / needs review / failed).
- Dialog: button disabled with reason, progress advances on mocked frames, Use replaces the box, Discard leaves it unchanged.
- Edge: 401 unauthenticated, 403 non-member, 400 bad input.

## Limits
- Test cases are assumed correct. If a test's expected output is wrong, the new solution will fail it; the panel says which cases failed so the professor can fix the test instead.
- Takes about 30–90 seconds (one or two AI calls plus code runs).
- Uses code-runner quota: one run per case, up to twice.
