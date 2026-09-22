# Daily DSA from the professor's exercise bank

Replace the fake "Merge k Sorted Lists" card on the student home with a real daily problem drawn from the course's published coding exercises.

## How it works for the student

- Each day the card shows one problem the student hasn't solved yet, chosen from the professor's published bank. The pick is stable for the whole day.
- Choice follows the student's progress: problems from weeks already unlocked in the lesson plan, earliest week and position first.
- "Start today's problem" opens the real code terminal with the problem statement and starter code.
- Inside the terminal the student can submit: the code runs against the exercise's test cases and shows which passed.
- The day counts as done only when all test cases pass. Failed submissions are still recorded, and the card shows attempts made today.
- A strict daily streak: solve one problem a day to keep it, miss a day and it resets.
- The card shows the streak, a small history of recent solved days, and total solved out of the bank.
- Once every published problem is solved, the card congratulates the student, stops offering new problems, and keeps the streak and history visible.
- If the course has no published coding exercises (or coding isn't approved for the course), the card explains that there's nothing set up yet instead of showing a problem.

## Technical notes

**Database**

- New table `coding_attempts`: id, student_id, course_id, exercise_id, submitted_code, language, passed (bool), cases_passed, cases_total, results jsonb, created_at. RLS: students insert/select their own rows; teachers select rows for their courses. GRANTs for authenticated + service_role.
- Keep the existing `coding_exercise_progress` as the "solved" signal, but write it with `source = 'daily_pass'` when a submission passes; opening the terminal keeps its current behaviour for the learning path.
- Streak and history are derived from `coding_attempts` where `passed` is true, grouped by date — no extra state to keep in sync.

**Test running**

- Student-side submit reuses the existing Judge0 `run-code` edge function and the compare logic in `src/lib/codingExerciseTestRun.ts`, generalised from the teacher's `ExerciseDraft` to a plain list of test cases so both sides share it.
- Only `standard_test_cases` (the public ones) run for students; hidden tests stay teacher-only.

**Frontend**

- New `src/lib/dailyDsa.ts`: day-key helper, candidate filtering/ordering against unlocked weeks, streak calculation from solved dates, plus unit tests.
- New `src/hooks/useDailyDsa.ts`: loads published exercises, solved ids, attempt history; exposes today's exercise, streak, counts, loading and empty states.
- `DailyDsaCard.tsx` rewritten against the hook with the states above (loading / no bank / today's problem / attempted today / solved today / bank complete).
- Deep link `?terminal=1&daily=1&exercise=<id>` in `AIChat.tsx` opens the terminal in exercise mode without marking progress on open.
- `CodingTerminalWidget.tsx` gains an optional submit panel (test cases + "Submit solution" + per-case results) shown only when an exercise with test cases is passed in.
