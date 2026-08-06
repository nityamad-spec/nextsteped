# Reasoning capture for Bloom 3+ questions

Add a mandatory "Explain your reasoning" textarea under every question whose Bloom level is 3 or higher, across weekly quizzes, exam prep, practice tests, and the diagnostic. The text is stored in the database for later review and analytics. It does not affect scoring or mastery in this phase.

## Behaviour

- The textarea appears only for Bloom 3+ questions, directly beneath the answer input.
- It is mandatory: the student cannot advance past the question or submit the assessment until it contains at least 15 characters. A live character hint and inline validation message make the requirement obvious.
- Bloom 1-2 questions look and behave exactly as they do today.
- Reasoning is captured regardless of whether the answer is right or wrong.
- Submission blocks with a clear toast naming the unanswered/unexplained question numbers.

## Storage

New table `public.student_answer_rationales`, one row per question the student explained:

- student, course, source format (`weekly_quiz` | `exam` | `practice` | `diagnostic`), source result id (nullable until the result row exists), question id, question source table, concept/topic, bloom level, selected answer, whether the answer was correct, the rationale text, timestamps.
- Row-level access: students insert and read only their own rows; teachers of the course can read rows for their course; admins full read. No student updates or deletes after submission.
- Rows are written server-side-safe from the client in one batch immediately after the result row is created, so the result id is always populated.

The rationale text is written only to this table, not duplicated into the results JSONB.

## Phases

1. **Data model** — migration creating `student_answer_rationales` with grants, RLS policies, and indexes on (student, course) and (source_result_id).
2. **Shared UI + hook** — a `ReasoningInput` component (label, textarea, min-length validation, character counter) and a small `useReasoningAnswers` hook holding `{questionId -> text}` plus a `missingReasoning(questions)` helper. Single source of truth for the 15-char rule and the Bloom 3 threshold.
3. **Weekly quiz + exam prep** (`AssessmentView.tsx`, `WeeklyQuizDialog.tsx`) — Bloom level already flows in via `questionMeta`; render the widget, gate Next/Submit, and batch-insert rationales after the `assessment_results` row is saved.
4. **Diagnostic** (`DiagnosticQuiz.tsx`) — read `bloom_level` alongside the questions it already fetches, render and gate the same way, insert after `diagnostic_results` is saved.
5. **Practice** (`PracticeQuestionsWidget.tsx`) — `bloom_level` is already on the generated question objects; render and gate, insert after the practice result is saved.
6. **Teacher/admin visibility** — read-only rationale display in the existing assessment analytics detail view, so professors can skim student reasoning per concept.

## Technical notes

- Threshold and min length live in one constants module so a future change is a one-line edit.
- Practice questions are AI-generated and may not exist in `assessment_questions`; the table stores the question id as plain text with a `question_source` discriminator rather than a foreign key, so all four formats fit the same shape.
- Insert failures are non-fatal: the assessment result is saved first and a failed rationale insert surfaces as a warning toast, never as a lost quiz attempt.
- Timed formats (exam prep, weekly quiz) auto-submit on timeout; in that path the mandatory rule is skipped and whatever text exists is stored, so a timeout can never trap the student.

## Out of scope

- Any AI grading of rationale quality, and any effect on score or mastery. The table is shaped to support that later.
