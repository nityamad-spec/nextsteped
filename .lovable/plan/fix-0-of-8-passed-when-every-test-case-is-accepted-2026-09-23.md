# Fix "0 of 8 passed" when every test case is Accepted

## What's going wrong
The code runner reports every case as "Accepted" (status 3) and the expected and actual outputs look the same ("SUCCESS"). The pass check is still failing because it compares the text exactly, character for character. Programs almost always print a trailing newline (Python `print` adds `\n`), so the actual output is `"SUCCESS\n"` while the expected value is `"SUCCESS"`. That invisible difference fails every case. The details panel doesn't show that newline, so the results look contradictory.

This is the most likely cause, but it hasn't been confirmed yet. Step 1 checks it against a live run before anything changes.

## Fix
1. **Confirm.** Run one case through the code runner and log the raw `stdout` and `expected` lengths/escaped text to see the trailing newline (or a `\r\n` mismatch).
2. **Compare the way standard judges do.** Before comparing, normalise both sides:
   - convert `\r\n` to `\n`
   - strip trailing whitespace on each line
   - drop trailing blank lines at the end
   Spacing *inside* a line and the line order still have to match. So a missing space in "1 2" still fails, but a trailing newline no longer does.
3. **Pass only on a real success.** A case passes only when it ran cleanly (status Accepted, no compile output or error output) and the normalised outputs match. Judge0's informational `message` field no longer marks a clean run as failed.
4. **Show why a case fails.** When a case fails only because of whitespace (this should now be rare), the details panel shows a short "Differs only in whitespace" note. Invisible characters appear in the failure detail so the professor can see them.
5. **Update the helper text** from "Output must match exactly" to "Output must match (trailing spaces and newlines are ignored)".

## Where this applies
The same comparison is shared by the professor's "Run test cases" check and the student coding terminal / daily DSA pass checks. All of them get the fix at once, so students also stop failing correct answers over a trailing newline.

## Technical notes
- `src/lib/codingExerciseTestRun.ts`: add exported `normalizeOutput(s)` and use it in `runOne`. Pass only when `statusId === 3`, there is no compile output or error output, and the normalised outputs are equal. Remove `message` from the error condition but still keep it for display.
- `src/components/teacher/CodingExerciseDialog.tsx`: update the helper text and add the whitespace-only note in the failure details.
- Check other exact-compare sites (`CodingTerminalWidget.tsx`, daily DSA submit path) and switch them to `normalizeOutput` if they compare on their own.
- `src/lib/codingExerciseTestRun.test.ts`: add cases for trailing newline passes, `\r\n` passes, inner-space difference fails, and Accepted with an informational message passes. The existing "exact mismatch" expectations will be updated to match.
- No database, edge function, or schema changes.
