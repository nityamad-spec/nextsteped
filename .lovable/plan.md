# Short-Answer Question Type — Phase 1: Database Schema

Goal: make the data model ready for short-answer questions across diagnostic quizzes, weekly quizzes, practice questions and exams. This phase only changes the database; no generation, UI or scoring code changes yet.

Decisions locked from your answers:
- AI grading with a stored verdict (auditable, not just a boolean).
- Model answer only — no separate rubric/keyword fields.
- Binary correct / incorrect, no partial credit.

## What changes in the database

### 1. Question storage (`assessment_questions`, `diagnostic_questions`)
Both tables already carry `format` and `answer`, and short-answer values already appear in the diagnostic path, so no new columns are strictly required for the question itself. Two small additions keep short-answer questions usable and gradable:
- `model_answer` (text, nullable) — the reference answer the grader compares against. `answer` stays as the canonical short display answer; `model_answer` holds the fuller expected response when the professor or generator writes one.
- `answer_max_words` (integer, nullable) — optional cap the UI can enforce on the student's response.

For MCQ / True-False rows both stay null, so existing rows are untouched.

### 2. New table: `short_answer_gradings`
One row per graded student short answer, giving an audit trail and letting a re-grade be traced.

Columns: `student_id`, `course_id`, `source_format` (weekly_quiz / exam / practice / diagnostic), `source_result_id`, `question_id`, `question_source` (assessment_questions / diagnostic_questions / generated), `student_answer`, `is_correct` (boolean), `grader` (ai / deterministic / manual_override), `model`, `grader_reasoning`, `confidence`, `graded_at`, `created_at`, `updated_at`.

This mirrors the shape of `student_answer_rationales`, so the same access rules apply: a student can insert and read their own rows, professors can read rows for their courses, admins read everything, and edge functions write with the service role.

### 3. Question-mix control
Professors need to say how many MCQ / True-False / Short-answer questions each format contains. `course_ta_settings` currently stores comma-separated type toggles (`quiz_question_mix`, `exam_question_mix`) with no counts. Add:
- `quiz_type_counts` (jsonb, default `{}`) and `exam_type_counts` (jsonb, default `{}`), each shaped `{ "mcq": n, "true_false": n, "short_answer": n }`.
- `diagnostic_type_counts` and `practice_type_counts` (jsonb, default `{}`) so the diagnostic and practice widget can be tuned the same way.

Empty `{}` means "fall back to today's behaviour", so nothing breaks before the later phases wire these up.

Per-exam overrides already have a home: `course_exams.breakdown` is jsonb, so individual exams can carry their own counts without a schema change.

### 4. Constraint and consistency work
- Widen any format/type check constraints so `short_answer` and the display value `Short Answer` are accepted (`assessment_questions.question_type`, `format` columns). Current check constraints on these tables only cover `tier`, so this is a review-and-confirm step rather than a rewrite.
- Add a validation trigger (not a CHECK) asserting that a short-answer row has no `options` and a non-empty `answer`, and that an MCQ row still has options — cheap protection against malformed generator output.
- Index `short_answer_gradings` on `(student_id, course_id)` and `(source_result_id)`.

## Suggested improvements

- Store the grader model name and reasoning from day one (included above). Without it you cannot tell a bad grade from a bad question when a student disputes a score.
- Allow a manual professor override on a grading row (`grader = 'manual_override'`) rather than editing the result JSON — keeps disputes clean.
- Keep `assessment_results.answers` unchanged in shape; short-answer text lives in `short_answer_gradings`, and only the boolean correctness flows into the existing scoring math. This keeps the 80/20 accuracy/pace scoring and mastery pipeline untouched.
- Cache the grade back into the results row at submit time so student-facing review screens never wait on the grading table.

## Risks and constraints

- **Grading latency.** AI grading is a network call per short answer. A 20-question quiz with 8 short answers is 8 calls. Later phases should batch them into a single grading request per submission, otherwise submit time balloons — the same problem the weekly-quiz follow-up pass had before it was removed.
- **Non-determinism.** The same answer can grade differently across runs. The stored verdict makes this visible; a deterministic exact-match pre-check before calling the model reduces both cost and variance.
- **Scoring dependencies.** `masteryScoring.ts`, `update-mastery` and the diagnostic branching logic all assume a question is instantly gradable at answer time. Short answers are only gradable after submission, so branching (adaptive tier selection mid-quiz) cannot depend on a short-answer result. Diagnostic branching should stay MCQ/TF-driven.
- **Reasoning widget overlap.** Bloom 3+ questions already demand a written rationale. A short-answer question plus a mandatory rationale means two textboxes on one screen. Later phases should suppress the rationale widget when the question is already free-text.
- **Type regeneration.** After the migration, the generated database types change and every file touching these tables recompiles; existing questions and results remain valid because all new columns are nullable or defaulted.

## Open item

Question-mix placement was left unanswered, so this plan assumes per-format counts in `course_ta_settings` plus the existing per-exam `course_exams.breakdown`. Say the word if you'd rather keep only the current type toggles with no counts.

## Next phases (not built yet)

2. `grade-short-answer` edge function with deterministic pre-check and batched AI grading.
3. Generation: emit short-answer questions honouring the configured counts.
4. Professor settings UI for the per-format mix.
5. Student UI: free-text answer input, review screen with grader feedback.
6. Scoring, mastery and analytics integration, plus tests.
