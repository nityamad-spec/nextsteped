# Short-Answer Questions Across All Testing Formats

Add a third question format — short answer — to the diagnostic quiz, weekly quizzes, practice questions, and exams, with professor control over how many MCQ / True-False / Short-answer questions each format contains.

## Current state

- Every generator is hard-limited to MCQ and True/False: `generate-diagnostic-questions` forces `format: "mcq"` only, `generate-weekly-quiz` and `generate-exam-questions` allow `["mcq","true_false"]`, `generate-practice-questions` enforces `ALLOWED_TYPES = ["mcq","true_false"]`, and `generate-exam-questions` explicitly rejects `short_answer`.
- The shared validator (`_shared/question-validation.ts`) already knows the `short_answer` format; the DB already stores a `format` column that accepts it.
- Mix control today: exams use a per-exam `breakdown` map derived from `exam_question_mix`; weekly quizzes use `quiz_question_mix`; diagnostic and practice have no mix control.
- Grading is index/text comparison in the client (`AssessmentView`, `WeeklyQuizDialog`, `DiagnosticQuiz`, practice widget).

## Decisions taken

- Short answers are graded by AI (Gemini Flash Lite), accept/reject only — no partial credit — reusing the pattern of the existing `evaluate-reasoning` function.
- Mix counts are set per format, inside the settings surface each format already uses.
- Diagnostic quiz includes short answer.
- The Bloom 3+ reasoning textarea is skipped on short-answer questions (the answer itself is the reasoning).

## Phase 1 — Grading service

New edge function `grade-short-answer` (Gemini 3.1 Flash Lite, batched, logged through `_shared/ai-log.ts`):

- Input: `{ items: [{ question_id, question_text, model_answer, explanation?, topic?, student_answer }] }`
- Output per item: `{ question_id, verdict: "correct" | "incorrect" | null, feedback }`
- Strict prompt: binary verdict, accept semantically equivalent wording and minor spelling/case differences, reject blank or off-topic answers.
- Deterministic pre-check first: exact/normalised match to the model answer short-circuits to `correct` without a model call.
- A `null` verdict (timeout/failure) is treated as incorrect for scoring but flagged so it never blocks the student, matching how `evaluate-reasoning` degrades today.

## Phase 2 — Mix controls (professor UI)

One shared count editor component (MCQ / True-False / Short answer) placed in each format's existing settings home:

| Format | Where | Stored in |
| --- | --- | --- |
| Weekly quiz | AI TA settings, quiz section | `course_ta_settings.quiz_question_mix` upgraded to counts |
| Exam | Exam Mode, per-exam card | existing `course_exams.breakdown` (add a Short Answer row) |
| Diagnostic | Diagnostic Questions Setup | new `course_ta_settings` column for the diagnostic mix |
| Practice | AI TA settings, practice section | new `course_ta_settings` column for the practice default |

Rules: counts must sum to the format's total question count; the UI keeps the sum in sync and blocks saving an invalid mix. Existing string values ("mixed", "mcq_only", …) are migrated to count maps on read, so nothing breaks for courses already configured.

## Phase 3 — Generation

For each generator, replace the hardcoded format allowlist with the configured per-format counts:

- Extend the JSON response schema `format` enum with `short_answer`; add short-answer authoring rules to the prompt (one-to-two-sentence answerable question, one unambiguous model answer, list acceptable alternate phrasings inside `explanation`).
- Short-answer items carry `options: null`, `answer` = model answer text.
- Batch by format so a shortfall in one format is topped up without re-rolling the others; the existing MCQ position-rotation and de-duplication logic stays MCQ-only.
- Diagnostic tiers get their short-answer allocation spread across the standard/easy/medium/hard tiers proportionally.

## Phase 4 — Student answering UI

- `AssessmentView`, `WeeklyQuizDialog`, `DiagnosticQuiz`, and the practice widget render a textarea for `format === "short_answer"` instead of option buttons, with a non-empty requirement before advancing.
- The Bloom 3+ reasoning textarea is suppressed for short-answer items in all four surfaces.
- Grading calls are batched at submission (per section for the diagnostic) with a spinner state, then correctness folds into the existing scoring path unchanged.
- Review screens show the student's text, the model answer, and the AI feedback line.

## Phase 5 — Scoring, mastery, analytics

- Short-answer verdicts are booleans, so `masteryScoring.ts`, `update-mastery`, and the 80/20 accuracy/pace formula need no formula change — only the correctness input path changes.
- `assessment_results.answers` stores the student's text plus verdict and feedback for short-answer items.
- Assessment analytics and diagnostics analytics gain a per-format breakdown so professors can see short-answer performance separately.

## Phase 6 — Tests

Unit tests for the mix parser/validator and the deterministic pre-check; component tests that a short-answer item renders a textarea, blocks empty submission, and hides the reasoning widget; an integration test that a mixed quiz scores correctly when the grader returns a mix of verdicts and when it fails entirely.

## Risks and constraints

- **Diagnostic latency and branching.** Phase A must be scored before the adaptive tier is chosen. If short answers land in Phase A, the student waits on a grading call mid-quiz. Mitigation: batch-grade Phase A in one call (~2-4s) and show a brief "scoring" state; alternatively short answers could be confined to Phase B — worth deciding during Phase 3.
- **Grading disagreement.** Binary AI grading will occasionally reject a defensible answer. There is no professor override surface today; adding one (mark correct on review) is a natural follow-up but is out of this scope unless you want it included.
- **Generation time and cost.** An extra format batch per generation increases both. Weekly quiz generation is already near its timeout ceiling, so short-answer generation runs as an additional parallel batch, not a serial pass.
- **Mix vs. availability.** If the bank has fewer short-answer items than requested, quizzes fall back to filling with MCQ rather than shipping short.
- **Existing questions.** All current banks are MCQ/TF; existing exams keep their current breakdown until a professor edits it.

## Open item

Should professors be able to override an AI grading verdict from the results/analytics view? Not included above; say the word and I'll add it as a phase.
