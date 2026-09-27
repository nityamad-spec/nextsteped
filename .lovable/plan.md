# 3-attempt cap with best-of-3 scoring for coding lab exercises

For upskilling pathways, each coding exercise in a coding lab week gives a student **3 Submit attempts**. Each attempt is scored with the shared accuracy + pace blend, the **best score is kept**, and after 3 attempts the exercise locks. Run with custom input stays free and unlimited.

## Confirmed decisions

- **Scope:** weekly coding exercises in coding lab weeks only (`lesson_plan_weeks.is_coding_week = true`). Daily DSA and freeform practice are unchanged.
- **Scoring:** accuracy + pace blend per attempt, best attempt wins.
- **Cap behavior:** after 3 attempts, Submit is locked; the student keeps their best score.
- **Attempt counting:** only Submit counts. Run with custom input never consumes an attempt.

## How an attempt is scored

Reuse the existing shared module `supabase/functions/_shared/attempt-scoring.ts` — no new scoring math:

```text
per attempt
  accuracy = cases_passed / cases_total
  pace     = paceCurve(elapsed_ms / expected_ms)
             expected_ms = EXPECTED_TIME_BASE_MS[bloom_level] x (0.6 + difficulty)
  signal   = 0.80 x accuracy + 0.20 x pace
  score    = round(100 x signal)        -- stored on the attempt

best score = max(score) over the student's attempts on that exercise
```

- `elapsed_ms` is sent by the client (time from when the student opened the exercise in the terminal to Submit), clamped server-side by the existing `PACE_MAX_RATIO` outlier guard. Missing/zero elapsed time counts as on-pace (pace 1.0), same as other formats.
- A full pass (all cases) still marks the exercise solved via `coding_exercise_progress` exactly as today — the cap does not change what "solved" means.

## Database changes (one migration)

- `coding_attempts`: add nullable `score integer` and `elapsed_ms integer` columns (additive, no breaking changes; old rows stay null and simply don't count toward a best score display).
- No new tables: attempt counting reads `coding_attempts` directly (`count where student_id + exercise_id`).

## Server enforcement (`submit-coding-solution` edge function)

1. After the existing enrollment + published checks, look up the exercise's week and check `lesson_plan_weeks.is_coding_week`. Non-coding weeks skip the cap entirely (unlimited, as today).
2. For coding-lab exercises, count the student's existing attempts on that exercise:
   - **3 or more:** do not run the code. Return `409` with `{ error: "No attempts left", attemptsUsed, bestScore }` — the student keeps their best score.
   - **Under 3:** run all test cases as today, compute the score via `scoreAttempt` from the shared module (single item: accuracy = cases passed ratio, pace from `elapsed_ms`), and save the attempt with `score` + `elapsed_ms`.
3. Every response gains `attemptsUsed` and `bestScore` so the UI can render the flag without a second query.

## Student-facing flags

**Coding terminal (`CodingTerminalWidget.tsx`):**
- A persistent badge near Submit: "Attempt 2 of 3 — your best score is kept".
- After each Submit, the report shows "X of Y passed · Score 72 · Best 80 · 1 attempt left".
- At 3 attempts: Submit is disabled with "No attempts left — best score: 80". Run with custom input still works.

**Learning path (`StudentLearningPath.tsx` / unit detail):**
- Coding exercises in lab weeks show attempts remaining (e.g. "2 of 3 attempts left") or the best score once locked.

**Professor side:** no changes in this pass — the exercise dialog and analytics keep working; the new columns are simply available.

## Tests

- Unit tests for the cap logic: attempt counting, lock at 3, best-of-3 selection, non-coding weeks uncapped.
- Component tests in `CodingTerminalWidget.test.tsx`: badge text, disabled Submit at cap, best-score display, Run not consuming attempts.
- Live verification as the student account on one exercise (2 submits max, to leave an attempt remaining).

## Notes / risks

- Attempts are counted per exercise per student from `coding_attempts`; deleting attempts (none exists in the UI today) would reset the count.
- Existing attempts made before this change count toward the cap but have no score; a student's best score is computed from scored attempts only (a pre-change full pass still shows as solved).
- The pace term depends on client-reported `elapsed_ms`; the existing outlier guard limits abuse, and this matches how other formats treat timing.
