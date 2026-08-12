# One scoring formula for every assessment

Today four surfaces score differently, so a 78% on a quiz means something different from a 78% on an exam or practice set.

## Current state

| Surface | Accuracy | Pace | Stored score |
|---|---|---|---|
| Diagnostic (`score-diagnostic`) | difficulty x Bloom weighted | 20% | `mastery_score` 0-1, plus `score` = raw correct count |
| Weekly quiz (`AssessmentView`, quiz) | difficulty x Bloom weighted | 20% | 0-100 blended |
| Exam (`AssessmentView`, exam) | difficulty x Bloom weighted | none | 0-100 accuracy only |
| Practice (`PracticeQuestionsWidget`) | flat 1 credit per question | none | 0-100 flat |

## Target

Every surface uses the identical blend already proven in the diagnostic:

```text
maxPoints  = difficulty x bloomWeight[bloom]
earned     = maxPoints x reasoningEarnedFactor(...)   (unchanged verdict logic)
accuracy   = sum(earned) / sum(maxPoints)
pace       = mean(paceCurve(actualMs / expectedMs))
score      = round(100 x (0.80 x accuracy + 0.20 x pace))
```

Confirmed decisions: exams get the full 80/20 including pace; practice gets per-question timing and the full 80/20; no backfill of historical attempts; diagnostic's `score` column becomes 0-100.

## Phases

### Phase 1 — Single source of truth
- Rename/extend `src/lib/masteryScoring.ts` `computeWeeklyQuizScore` to a neutral `computeAssessmentScore(items)`; keep the old name as a thin alias during migration so nothing breaks mid-change.
- Confirm the Deno CONFIG block in `score-diagnostic` matches constant-for-constant, and add a comment marking the pair as synced (same convention as `_shared/reasoning-scoring.ts`).

### Phase 2 — Exam
- In `AssessmentView.tsx`, drop the `type === "quiz"` condition so exams run through the same scorer with per-question times (already tracked via `questionTimes`).
- Keep `weightedScore` and `flatScore` on the results object for the existing review UI and analytics, but `score` becomes the blended value for both quiz and exam.

### Phase 3 — Practice
- `PracticeQuestionsWidget.tsx` currently records only a total `timeSpent`. Add a per-question timer: stamp on question display, accumulate ms per question id (mirroring `AssessmentView`'s approach), including time spent on the instant-feedback step being excluded from the answer time.
- Replace the flat credit loop with `computeAssessmentScore`, feeding `difficulty_estimate`, `bloom_level`, per-question ms and the reasoning verdict.
- Persist `question_times` on the practice row in `assessment_results` (column already exists) so practice history and mastery see the same shape as other formats.

### Phase 4 — Diagnostic score column
- `score-diagnostic` writes `score = round(masteryScore * 100)` instead of the raw correct count; the raw count stays available as `correct_answers`-style data inside the existing `answers` payload and the response body.
- Update every reader so "score" is not misread as a count: `useDiagnosticStatus.ts`, `useStudentStatus.ts`, `StudentHome.tsx`, `StudentLearningPath.tsx`, `AssessmentAnalytics.tsx`, `DiagnosticsAnalytics.tsx`, the three Excel exporters, and `generate-teaching-insights`.
- Anywhere a reader renders `score / total_questions`, switch to the percentage directly.

### Phase 5 — Mastery consistency
- `update-mastery` already receives per-question data from all four callers; verify practice now sends `time_ms` and that the source-specific EMA alphas still make sense once practice is weighted rather than flat. No formula change to mastery itself.

### Phase 6 — Tests
- Extend `masteryScoring.test.ts` with a cross-surface invariant: the same item set scored as quiz, exam and practice returns an identical number.
- Deno test for `score-diagnostic` asserting `score` is now 0-100 and equals `round(mastery_score * 100)`.
- A practice-widget test that per-question timing is captured and reaches the persisted payload.

## Risks and constraints

- **Mixed-scale history.** Diagnostic rows written before Phase 4 hold a raw count in the same column that will hold a percentage afterwards. With no backfill, any chart plotting that column over time will show a visible discontinuity. Options if that matters later: a one-off data migration, or filtering charts by a cutover date.
- **Exams get slower-is-worse.** A careful student who uses the full time window now scores below a fast one with identical answers. The pace curve only decays past the expected time (Bloom- and difficulty-derived), not past the exam limit, so long generous limits are safe; tight ones will compress scores.
- **Practice timing is new data.** Old practice rows have no `question_times`, so the scorer's fallback (missing time = expected time = pace 1.0) applies. Old practice scores also used a different accuracy model, so practice trends across the cutover shift.
- **Two copies of the constants.** Browser (`src/lib`) and Deno (`score-diagnostic`) cannot share a module; drift stays the long-term risk, mitigated by mirrored tests.
- **No DB migration required.** All columns used already exist.
