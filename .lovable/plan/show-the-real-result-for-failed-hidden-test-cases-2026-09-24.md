# Show the real result for failed hidden test cases

## What's going wrong
The grading is correct: all 7 cases failed (0 of 7). The label is what's misleading. Next to a hidden case, the terminal shows the code runner's raw status. "Accepted" there only means "the program ran without crashing". It doesn't mean the output was right. In your screenshot the program printed nothing (Case 3: expected "65.3", got ""), so every hidden case produced the wrong output, yet the runner still reported "Accepted".

## Fix
1. **The grader returns a clear verdict for each case**, worked out on the server:
   - Passed
   - Wrong answer: the program ran but the output doesn't match
   - Runtime error, Compile error, Time limit exceeded: taken from the runner's own error statuses
   - No output: the program ran but printed nothing
2. **The terminal shows that verdict** instead of the raw status, for hidden and visible cases alike. A failed case can never show "Accepted" again.
3. **Hidden cases stay hidden.** They show only the verdict. Their input, expected output and actual output are still never sent to the browser.
4. **Saved attempts store the verdict too**, so later reviews read the same way.

## Technical notes
- `supabase/functions/_shared/judge0.ts`: add `judgeVerdict(result, expected)` that returns `passed | wrong_answer | no_output | runtime_error | compile_error | time_limit | error`, keyed off `statusId` (3 = Accepted, 5 = TLE, 6 = compile, 7–12 = runtime) plus the normalised output comparison.
- `supabase/functions/submit-coding-solution/index.ts`: include `verdict` in every result and in `attempt.results`. Keep `status` for backward compatibility.
- `src/components/CodingTerminalWidget.tsx`: add a verdict-to-label map. Failed rows show the label (for example "Wrong answer"). The client falls back to "Failed" when `verdict` is missing and `passed` is false, and never shows the raw status for a failed case.
- Apply the same labelling in the professor's test-run panel (`codingExerciseTestRun.ts` / `CodingExerciseDialog.tsx`) so both sides match.
- Unit tests for `judgeVerdict` and for the label mapping. Redeploy the function. No database schema changes.
