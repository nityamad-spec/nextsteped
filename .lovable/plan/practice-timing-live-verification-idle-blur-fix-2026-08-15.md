# Practice timing: live verification + idle/blur fix

## Status of the live browser pass

The authenticated browser pass could not run: the sandbox reports no active student session
(`signed_out`), so a practice set cannot be completed end to end. Sign in as a student once in the
Lovable preview and the session becomes available on the next turn — then the pass runs
automatically as step 1 below.

Database check done instead: the 8 most recent `practice` rows in `assessment_results` are all from
Aug 14 (before the timing standardisation) and none of them contain a `time_ms` key in `answers`.
So there is still no post-change attempt proving timing lands in storage.

## Phase 1 — Verify (after sign-in)

Drive a practice set in the running app, answering 2-3 questions with deliberate pauses, then query
the newest `practice` row and confirm every item in `answers` carries a plausible non-zero `time_ms`
and that `question_times` is populated.

## Phase 2 — Fix idle / tab-blur inflation

Today the per-question timer is pure wall clock: time keeps accruing while the tab is hidden, the
window is unfocused, or the student walks away. That inflates `actualMs`, drags the pace term down,
and unfairly lowers the 80/20 blended score.

Introduce one shared hook, `src/hooks/useActiveQuestionTimer.ts`, that accumulates only *active*
time:

- Starts/stops on `visibilitychange`, `window` focus/blur.
- An idle guard: no pointer, key, or scroll event for N seconds (default 60) stops the clock, and
  the next interaction restarts it — so the idle period is excluded, not merely capped.
- Exposes `commit(questionId)` and `reset()` mirroring the current API, so call sites change little.
- Time accrued is monotonic (`performance.now()`), immune to system clock changes.

Apply it to all four surfaces that currently roll their own wall-clock timer:

| Surface | File | Current mechanism |
| --- | --- | --- |
| Practice questions | `src/components/PracticeQuestionsWidget.tsx` | `questionEnteredAtRef` + `commitQuestionTime` |
| Weekly quiz / exam / diagnostic | `src/components/AssessmentView.tsx` | `questionStartRef` + `questionTimes` (seconds) |
| Chat practice submit path | `src/pages/student/AIChat.tsx` | consumes `time_ms` — no change needed |
| Diagnostic page | `src/pages/student/DiagnosticQuiz.tsx` | goes through `AssessmentView` |

`AssessmentView` keeps tracking in seconds for its existing display and only converts to ms at
submit, as it does now. The countdown time limit stays real-time (it is a deadline, not effort) —
only the per-question effort clock pauses.

## Phase 3 — Guard the scorer

Add a defensive clamp in `supabase/functions/_shared/attempt-scoring.ts`: treat `time_ms` above a
generous ceiling (e.g. 10x expected) as the ceiling rather than letting a single stale value crush
the pace term. Cover it with a unit test alongside the existing pace-curve tests.

## Phase 4 — Tests

- Unit tests for the hook: hidden tab does not accrue, idle window does not accrue, resume works.
- Extend `src/lib/attemptScoring.test.ts` for the outlier clamp.
- Re-run the frontend Vitest suite and the Deno scoring tests; report results without auto-fixing
  unrelated failures.

## Notes and risks

- "Reveal answer" reading time still counts toward the question; that is intentional unless you want
  it excluded too.
- Idle threshold is a judgement call — 60s is a starting point, easily tuned.
- No database schema change. Historic rows without `time_ms` keep scoring as "on pace"; no backfill
  is proposed.
