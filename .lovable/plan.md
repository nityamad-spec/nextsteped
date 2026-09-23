# Run with custom input + Submit against all test cases

## What's wrong today
- **Run** sends no input, so any program that reads input crashes (the "EOFError" in your screenshot).
- **Submit** only shows up for daily DSA problems. Weekly Learning Path exercises have Run only.
- Submit only checks the test cases students can see. Hidden test cases are never used.

## What students will see
1. **Custom input box** next to the Output panel. It starts filled with the first sample test input. **Run** sends that input to the program and shows the output as it does now.
2. **Submit** button on every exercise (weekly and daily). It runs the code against every visible and hidden test case and shows a report:
   - "X of Y test cases passed"
   - Visible cases: pass/fail, plus expected vs actual output when a case fails
   - Hidden cases: pass/fail only, labelled "Hidden case N". The input and expected output are never shown.
3. **Passing every case:**
   - Weekly exercise: the attempt is saved and the exercise is marked solved.
   - Daily DSA: same as today (attempt saved, day counted, mastery nudge).
   - Failed attempts are saved too.
4. Freeform practice (no exercise loaded) keeps Run + custom input and has no Submit.

## Technical details
- **New edge function `submit-coding-solution`**: takes a Bearer JWT and `{ bank: "weekly" | "daily", exerciseId, language, code }`.
  - Checks the student is actively enrolled in the course and the exercise is published.
  - Uses the service role to load the visible cases plus the hidden ones from `coding_exercise_private` or `daily_dsa_question_private`.
  - Runs each case through `_shared/judge0.ts` (`runOnJudge0`, `judgePassed`) with limited concurrency. Caps: 50k characters of code, 30 cases.
  - Writes the attempt server-side to `coding_attempts` or `daily_dsa_attempts`. For a full pass on a weekly exercise, it also upserts `coding_exercise_progress`.
  - Returns per-case results. Hidden cases come back with no input, expected output or actual output.
- **run-code**: already accepts `stdin`, so no change is needed there. The widget will now send the custom input as `stdin`.
- **CodingTerminalWidget**:
  - Add a custom input textarea and pass its value to Run.
  - `handleSubmit` calls the new function instead of running test cases in the browser.
  - The results list shows "Hidden case N" rows.
  - The daily mastery nudge and `onSolved` stay on the client, keyed off the server result.
- **AIChat**: build `submission` for weekly exercises too (not only when `isDaily`). The Submit button shows whenever an exercise is loaded, even one with no visible cases, as long as it has any test cases.
- The existing browser-side test runner stays in place for the professor's dialog.
- Tests: unit tests for how results are shaped (hidden cases redacted). Smoke-test the function's auth with curl. Browser check using a student session only, with no destructive actions.
