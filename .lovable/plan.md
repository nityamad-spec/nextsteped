# Show best attempt + correct solution after attempts run out, and highlight the code area

Scope: upskilling courses, coding exercises in coding lab weeks (the ones with the 3-attempt cap). Other exercises are unchanged.

## What the student will see

**1. When all 3 attempts are used and they open the exercise:**
- A "Review" view replaces the empty editor, with two tabs:
  - **Your best attempt** — the code from their highest-scoring submission (read-only), with its score and "X of Y tests passed".
  - **Correct solution** — the professor's approved solution (read-only), with a short note: "Compare with your answer to see what was different."
- Submit stays locked. Run with custom input still works, so they can try out the correct solution or their own code.
- A "Copy into editor to experiment" button lets them load either version into the editor for free practice (nothing is graded).

**2. Clear "type your code here" highlight (always, for every coding exercise):**
- The editor area gets a labelled header — "Write your code here" with a pencil icon — and a coloured border and soft tinted background, so it clearly stands apart from the problem statement, custom input, and output areas.
- The border gets stronger when the student clicks into it.
- When the editor still holds the starting template, a small hint appears: "Replace the TODO lines with your solution."
- The custom input box keeps a neutral style so it is not confused with the answer area.

## Safety
- The correct solution is only released by the server after it confirms the student has used all 3 attempts on that exercise. Students with attempts left cannot get it, even by tampering with the page.
- Hidden test cases stay hidden.

## Technical details
- New edge function `get-coding-review` (bank: weekly, exerciseId): verifies JWT + active enrollment + exercise is in an `is_coding_week` week + student's `coding_attempts` count >= 3. Returns `{ bestAttempt: { code, language, score, cases_passed, cases_total }, referenceSolution, solutionLanguage }`. Best attempt = highest `score`, tie-break most recent; falls back to most cases passed for unscored legacy rows. Reads `coding_exercise_private.reference_solution` with service role. Returns 403 otherwise.
- `CodingTerminalWidget.tsx`: when `capReached`, fetch review once and render the Review tabs (read-only `<pre>` blocks); also fetch right after the 3rd submit. Restyle editor pane header/border using semantic tokens (primary/accent), add aria-label "Your code".
- `AIChat.tsx`: pass exercise id/bank already available; no DB migration needed.
- Tests: widget tests for review rendering at cap, no fetch when attempts remain, editor label present; edge function unit check for the 403 path. Live check on the test student's already-used exercise only if it is at cap — no extra submissions without your OK.

---

# Part 2: Difficulty and Bloom's level for coding questions in the practice question pool

## What the professor will see (Practice Question Pool step, Coding exercise selected)
- **Difficulty**: Easy / Medium / Hard. Defaults to **Medium** for coding. The "Mixed" choice stays available for non-coding questions only.
- **Bloom's level**: a new dropdown for levels 1–6 (Remember, Understand, Apply, Analyze, Evaluate, Create). Defaults to **3 – Apply**.
- Every generated coding question gets exactly the level and difficulty picked.
- Each coding question in the review list gets editable Difficulty and Bloom's controls, so the professor can re-tag a question before or after approving it.

## Technical details
- `PracticePoolSetup.tsx`: when kind switches to coding, set difficulty to "medium" (and hide "mixed"). Add `bloomLevel` state (default 3) and send it in the `generate-practice-pool` body. Add per-row inline selects that update `practice_pool_questions.bloom_level` / `difficulty` (easy 0.3, medium 0.5, hard 0.75). Course members already have update access.
- `generate-practice-pool`: add optional `bloomLevel` (1–6) to the request. For coding, tell the AI to target that level and the chosen difficulty, then store the professor's values instead of the AI's. Non-coding behavior stays the same.
- No database changes. Tests: the defaults (Medium, Bloom 3), sending the values on generate, and saving inline edits.
