# Verify test cases against the reference solution

Add a "Run test cases" button to the coding exercise edit window. It runs the reference solution against every test case (standard and hidden) through the code execution service and reports which ones pass.

## What the professor sees

- A new panel above the existing AI quality review, titled "Test case check", with a "Run test cases" button.
- While running: a progress bar ("Running test case 3 of 8").
- When done: a summary line ("6 of 8 passed") and a per-case row showing pass or fail, with the case number and whether it is standard or hidden.
- For a failing case, an expandable detail showing the expected output versus what the reference solution actually produced, plus any error or compile message.
- Results are shown only while the window is open and are not saved. Editing fields and re-running gives fresh results.
- Nothing is blocked: a failing check does not prevent saving, marking reviewed, or publishing.

## Behaviour details

- Runs against the current unsaved values in the window, so a professor can fix a test case and re-check immediately.
- Output comparison is exact — any difference in spacing or newlines counts as a failure.
- Button is disabled when there is no reference solution or no test cases, with a short hint explaining why.
- If the code execution service is unavailable or rejects credentials, a single clear message appears instead of per-case results.

## Technical notes

- New file `src/lib/codingExerciseTestRun.ts`: types (`TestRunCase`, `TestRunResult`, `TestRunProgress`) and `runReferenceAgainstTestCases(draft, onProgress)`. It iterates standard then hidden cases, invoking the existing `run-code` edge function via `supabase.functions.invoke` with `{ language, code: reference_solution, stdin: input }`, and compares `stdout` to `expected_output` exactly. A non-zero Judge0 status, stderr, or compile output marks the case failed and carries the message through. Cases run sequentially with a small concurrency limit (2) to stay inside Judge0 quota; progress is reported after each case.
- `src/components/teacher/CodingExerciseDialog.tsx`: new local state (`testRunning`, `testProgress`, `testResults`, `testError`), a `handleRunTests` callback, and the results panel rendered above the AI quality review block. Reuses `Progress`, `Badge`, and the existing pass/fail icon styling.
- No database, schema, or edge function changes; `run-code` already accepts any authenticated user and supports all four languages.
- Unit tests in `src/lib/codingExerciseTestRun.test.ts` with a mocked invoke: all-pass, output mismatch, runtime error, compile error, service unavailable, and progress ordering.
