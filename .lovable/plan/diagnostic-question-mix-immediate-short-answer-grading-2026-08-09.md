# Diagnostic Question Mix + Immediate Short-Answer Grading

Two changes: professors choose the format mix for the diagnostic bank, and short answers are graded by AI the moment a student answers, instead of by naive text comparison at submit.

## 1. Format mix control (/teacher/setup/diagnostic)

A new "Question Format Mix" card above the generate action:

- Three rows — Multiple Choice, Short Answer, True/False — each with minus/plus steppers moving in 10% increments.
- Defaults: 40% MCQ, 40% short answer, 20% true/false.
- Total must equal 100%. The running total is shown; generation is blocked with an inline message while it is off 100. Steppers clamp at 0% and at whatever leaves the others non-negative.
- Below the sliders, a live preview of the resulting counts: "8 multiple choice, 8 short answer, 4 true/false out of 20".
- Saved to the existing `diagnostic_type_counts` setting on the course. Empty setting falls back to the 40/40/20 default.

Percentages apply across the whole 20-question bank, as chosen. The generator spreads each format as evenly as it can over the four tiers (standard/easy/medium/hard, 5 each) so no tier is all one format.

## 2. Generation supports three formats

`generate-diagnostic-questions` today hard-codes multiple choice. It will:

- Read the course's mix, convert to whole-question counts over 20, and derive a per-tier format quota.
- Ask the model for the exact per-tier format counts, and accept `mcq`, `true_false`, and `short_answer` items.
- Validate per format: MCQ needs 4 options and a valid correct index; true/false needs exactly True/False options; short answer must carry no options plus a model answer and a suggested max word count, and no correct-index.
- Retry a tier when the returned format counts do not match the quota, using the existing tier retry loop.

## 3. Immediate grading in the student diagnostic

When a student submits a short answer and moves on:

1. Their answer text is recorded as a short-answer response.
2. `grade-short-answer` is called right away in the background. The student is not made to wait and sees no verdict — grading is silent, exactly as you chose.
3. Verdicts are collected and used as the correctness signal for those questions when the attempt is scored.

Two points where pending grades are awaited (with a time budget, never blocking indefinitely):

- Before the adaptive branch is chosen after question 5, so the branch reflects real short-answer correctness.
- Before final submission, alongside the existing reasoning-evaluation flush.

If a grade has not landed in time, or grading is unavailable, that question falls back to the current normalised text comparison against the model answer.

Short-answer questions at Bloom 3+ keep a single box — no separate reasoning textarea. MCQ and true/false keep the reasoning box unchanged.

## Risks and constraints

- **Existing banks are all multiple choice.** The mix only takes effect on regeneration. Professors who already generated a diagnostic must regenerate (all four tiers) to get short answers. The setup page will say so when the saved mix does not match the current bank.
- **Branch latency.** The branch decision after question 5 may have to wait on up to two short-answer grades. Grading starts per question, so most are done by then; the wait is capped and falls back to text matching.
- **Grading is one call per answer.** Roughly 8 extra model calls per diagnostic attempt. Acceptable, but it is new per-student cost.
- **Response rows are insert-only.** A grade is written once and never overwritten; a re-graded answer is not possible without a schema change. Duplicate submissions for the same question are blocked by the existing unique index.
- **20 questions with 10% steps** means each 10% is exactly 2 questions, so every valid mix maps cleanly to whole questions. If diagnostic length ever becomes configurable, this rounding needs revisiting.

## Technical notes

- Setting: `course_ta_settings.diagnostic_type_counts` (jsonb, already present) storing `{ mcq, true_false, short_answer }` as percentages. No migration needed.
- Question fields `model_answer` and `answer_max_words` on `diagnostic_questions` already exist from Phase 1, as does the `validate_question_format_shape` trigger that enforces the per-format shape server-side.
- Files touched: `src/pages/teacher/DiagnosticQuestionsSetup.tsx`, `src/hooks/useTASettings.ts` (expose the mix), `supabase/functions/generate-diagnostic-questions/index.ts`, `src/pages/student/DiagnosticQuiz.tsx`, and a new small hook mirroring `useReasoningAnswers` for short-answer grading state (insert row, invoke `grade-short-answer`, flush-and-wait).
- `score-diagnostic` already consumes `is_correct` from the client, so no edge-function change is needed there.
- Unit tests for the mix-to-quota maths (percent → per-tier counts) and for the grading fallback path.
