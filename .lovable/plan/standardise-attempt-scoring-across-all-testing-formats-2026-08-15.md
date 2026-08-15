# Standardise attempt scoring across all testing formats

One scoring implementation, shared from `supabase/functions/_shared/`, used by weekly quiz, exam, practice and diagnostic — and by the mastery pipeline.

## Confirmed decisions

- Shared **module** in `_shared` (not an HTTP endpoint) — no submit latency, no new failure mode.
- Pace enters mastery: the shrunk/EMA signal is the 80/20 blend, not accuracy alone.
- Reasoning factor becomes a **flat 0.5**, replacing today's Bloom-scaled `min(1, 1.2 / bloomWeight)`.
- No backfill; history stays as scored.

## The single formula

```text
per question
  maxPoints = clamp01(difficulty) x bloomWeight[bloom]      1.0 1.2 1.5 1.8 2.1 2.5
  bloom <= 2                       -> factor = correct ? 1 : 0
  bloom >= 3, correct  + accepted  -> factor = 1
  bloom >= 3, correct  + rejected  -> factor = 0.5
  bloom >= 3, wrong    + accepted  -> factor = 0.5
  bloom >= 3, wrong    + rejected  -> factor = 0
  bloom >= 3, no verdict           -> factor = correct ? 1 : 0   (never punish an AI outage)
  earned = maxPoints x factor

per attempt (and per concept inside an attempt)
  accuracy   = sum(earned) / sum(maxPoints)
  expectedMs = EXPECTED_TIME_BASE_MS[bloom] x (0.6 + difficulty)
  pace       = mean(paceCurve(actualMs / expectedMs))
  signal     = 0.80 x accuracy + 0.20 x pace          (0..1, unrounded)
  displayScore = round(100 x signal)                  (what the student sees)

concept mastery (unchanged shape, new input)
  w      = n / (n + 8)          n = questions ever attempted on the concept, after this attempt
  shrunk = w x signal + (1 - w) x 0.5
  new    = alpha x shrunk + (1 - alpha) x old         alpha: quiz .4, exam .6, practice .15, diagnostic .4

course mastery, level bands and evidence caps: unchanged
```

`displayScore` is the rounded integer; mastery consumes the **unrounded** `signal` so rounding never compounds.

## Phase 1 — the shared module

New `supabase/functions/_shared/attempt-scoring.ts`, dependency-free and Deno-safe:

- Constants: `BLOOM_WEIGHT`, `EXPECTED_TIME_BASE_MS`, `PACE_*`, `WEIGHTS = {accuracy: .80, pace: .20}`, `REASONING_BLOOM_THRESHOLD = 3`, `REASONING_PARTIAL_FACTOR = 0.5`, `REASONING_SCORING_ENABLED`.
- `reasoningEarnedFactor({ bloom, isCorrect, verdict })` — flat 0.5, no `bloomWeight` argument any more.
- `paceCurve(r)`, `maxPointsFor(item)`, `expectedMsFor(item)`.
- `scoreAttempt(items) -> { accuracy, pace, signal, displayScore, reasoningAdjustment }`.
- `scoreAttemptByConcept(items) -> Map<conceptId, { accuracy, pace, signal, questionCount, correctCount }>` — the concept-wise path used by diagnostic and exam.

`supabase/functions/_shared/reasoning-scoring.ts` becomes a thin re-export so existing importers keep compiling; its Bloom-scaled math is deleted.

`src/lib/masteryScoring.ts` and the reasoning-scoring block of `src/lib/reasoning.ts` become a thin browser mirror of the same file (edge functions cannot import from `src/`, and Vite cannot import Deno modules cleanly). A **parity test** runs a fixed matrix of questions (every Bloom x correctness x verdict x pace bucket) through both copies and asserts identical output, so drift fails CI rather than silently changing scores.

## Phase 2 — mastery pipeline

`update-mastery`:

- Per-question payload gains `time_ms` (already sent by most callers) and keeps `reasoning_verdict`.
- Per concept, compute `accuracy` and `pace` via `scoreAttemptByConcept`, and shrink/EMA the blended `signal` instead of raw accuracy.
- `questions_attempted` / `questions_correct` keep counting primary correctness only, so the evidence gates and level caps behave exactly as today.
- `per_concept` aggregate fallback (no per-question data) keeps its accuracy-only signal with pace treated as 1.0 — documented, since aggregate callers have no timings.
- `mastery.ts` keeps `shrink`, `blendConceptScore`, `bandFor`, `cappedLevel`, `applyPracticeOnlyGate` untouched; only its input changes.

## Phase 3 — the four surfaces

| Surface | Change |
|---|---|
| Weekly quiz (`AssessmentView`) | swap to shared module; behaviour identical apart from the 0.5 factor |
| Exam (`AssessmentView`) | now uses the same 80/20 blend — **pace starts affecting exam scores** |
| Practice (`PracticeQuestionsWidget`) | stop using flat correct/total; needs per-question `time_ms` captured, plus difficulty/bloom on generated questions |
| Diagnostic (`score-diagnostic`) | drops its local CONFIG block and calls the shared module; also returns per-concept signals |

Diagnostic and exam send `per_question` rows tagged with `concept_id` so `update-mastery` writes a separate row per concept from one attempt.

## Phase 4 — tests

- Deno unit tests for `attempt-scoring.ts`: factor table, pace curve boundaries, per-concept split, ordering invariant `correct+accepted > correct+rejected == wrong+accepted > wrong+rejected`.
- Browser/Deno parity test (Phase 1).
- Update `masteryScoring.test.ts` and `reasoningScoring.integration.test.tsx` for the 0.5 factor.
- `update-mastery` test asserting pace moves the stored concept score and that attempted/correct counters do not.

## Risks and constraints

- **Scores move.** Exams gain a pace term and every Bloom 3-6 partial-credit case changes (0.8 -> 0.5 at Bloom 3, 0.48 -> 0.5 at Bloom 6). Students mid-semester will see a step change; no backfill means pre/post cutover attempts are not comparable.
- **Pace in mastery** means a slow, fully correct student is capped at 0.8 + 0.2·pace on that concept — with the 0.75 expert band, consistently slow work now blocks "expert". Worth confirming that is intended.
- **Practice timing may not exist** per question today; if it isn't captured, practice keeps pace = 1.0 until the widget records it (flagged during Phase 3, not silently defaulted).
- **Short-answer questions** carry a graded verdict rather than a boolean in some paths; they map to `is_correct` from the grader before scoring — no separate branch.
- **Two code copies remain** (Deno + browser) because Vite and Deno cannot share one file here; the parity test is the mitigation.
- Missing/zero `time_ms` falls back to expected time (pace 1.0), unchanged from today.
