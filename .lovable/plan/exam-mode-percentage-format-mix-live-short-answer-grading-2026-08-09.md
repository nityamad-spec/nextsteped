# Exam Mode: percentage format mix + live short-answer grading

Two changes, both scoped to exams.

## 1. Question Format Mix on /teacher/setup/exam-mode

Replace the current "Question Types" chip selector (MCQ / True-False toggles) with the same percentage control already used on the diagnostic setup page:

- Three rows — Multiple Choice, Short Answer, True / False — with minus/plus steppers in 10% steps.
- Default 40% MCQ, 40% short answer, 20% true/false.
- The total always stays at 100: raising one bucket takes from the largest other bucket, lowering gives it back. No invalid state is reachable, so no error state is needed.
- Saved per course in the existing `exam_type_counts` setting.

Each exam card's breakdown (the per-type question counts shown per mock test) is derived from the mix applied to that card's estimated question count, so cards now show three rows: MCQ, Short Answer, True/False. Manual per-card overrides keep working exactly as today — a card the teacher has edited is left alone when the mix changes.

Exams already generated keep their current questions; the new mix takes effect the next time that exam is regenerated. A note says so on any card that already has questions.

## 2. Exam generation supports short answer

`generate-exam-questions` currently accepts only `mcq` and `true_false` and explicitly rejects short answer. It will:

- Accept the per-format target counts sent from the exam card breakdown.
- Generate short-answer items with a reference answer, a fuller model answer, and a suggested max word count; no options and no correct index.
- Validate per format (MCQ: 4 distinct options and a valid answer; true/false: exactly True/False; short answer: no options, model answer present).
- Reserve slots per format and retry a batch when the returned format counts miss the quota, reusing the same strict slot-reservation loop already proven on weekly quiz generation.

## 3. Immediate short-answer grading during an exam

When a student answers a short-answer question in an exam and moves on:

1. The answer is recorded as a short-answer response.
2. `grade-short-answer` is called immediately in the background. Grading is silent — the student sees no verdict and never waits.
3. Verdicts are the correctness signal for those questions at scoring time; anything that has not landed by submission (after a short capped wait) falls back to normalised text comparison against the model answer.

This is the same mechanism as weekly quizzes; the exam path simply never passed the required props.

## Risks and constraints

- **Existing exams are all MCQ/true-false.** Nothing is regenerated automatically; each mock test must be regenerated to pick up the mix.
- **Short exams round coarsely.** A 20-minute exam is about 7 questions, so a 20% bucket can round to 1 or 0. Largest-remainder rounding keeps the total exact but the realised mix will only approximate the chosen percentages on small exams.
- **Teacher-approved breakdowns.** Switching to percentages changes the breakdown shape from two rows to three; cards already approved will show as changed and need re-approval before regeneration.
- **Cost**: roughly one grading call per short answer, so about 8 extra model calls per student on a 20-question exam at the default mix.
- **Rationale rows are insert-only** — a grade is written once and cannot be re-graded without a schema change.

## Technical notes

- Setting: `course_ta_settings.exam_type_counts` (jsonb, already present). Legacy `exam_question_mix` stays written for backward compatibility with older student code paths.
- Reuses `src/lib/questionMix.ts` (`adjustMix`, `allocateFormats`, `normalizeMix`) and its edge mirror `supabase/functions/_shared/question-mix.ts` — no new mix maths.
- `assessment_questions.model_answer` / `answer_max_words` and the `validate_question_format_shape` trigger already exist. No migration.
- Files touched: `src/pages/teacher/ExamMode.tsx` (mix UI, breakdown derivation, generation payload), `src/hooks/useTASettings.ts` (expose `examTypeCounts`), `supabase/functions/generate-exam-questions/index.ts` (three formats + per-format quotas), `src/pages/student/AIChat.tsx` (fetch `model_answer` / `answer_max_words`; pass `studentId`, `shortAnswerSource`, `shortAnswerMeta` into `AssessmentView` for exams). `src/components/AssessmentView.tsx` and `src/hooks/useShortAnswerGrading.ts` need no change.
- `src/components/ExamQuestionsViewDialog.tsx` gets short-answer labelling and reference/model-answer display, mirroring the weekly quiz review dialog fix.
- Unit tests for exam mix-to-breakdown allocation and the grading fallback path.
