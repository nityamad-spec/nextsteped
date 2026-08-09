# Short-Answer Questions — Phase 1: Database Schema

Goal: make the data model ready for short-answer questions across diagnostic quizzes, weekly quizzes, practice questions and exams. Database only — no generation, UI or scoring changes in this phase.

Decisions locked from your answers:
- Reuse `student_answer_rationales` with a kind flag; the student's short answer lives in `rationale_text`.
- A short-answer question has one free-text box only — the answer *is* the reasoning, no second rationale row.
- The AI grade reuses `ai_verdict` / `ai_feedback` (`accepted` = correct, `rejected` = incorrect).
- Rows stay insert-only; no professor override, no regrade path.

## What changes

### 1. `student_answer_rationales` becomes the free-text response table

Add:
- `response_kind` (text, NOT NULL, default `'reasoning'`, check in `('reasoning','short_answer')`) — separates a short-answer response from an MCQ rationale. Existing rows take the default, so nothing needs backfilling.
- `model_answer_snapshot` (text, nullable) — the reference answer the grader compared against, copied in at grade time so a later edit to the question doesn't invalidate the audit trail.

Constraint work:
- `bloom_level` stays NOT NULL 1–6. Short-answer questions can be Bloom 1, which the existing check already allows.
- `source_format` and `question_source` checks already cover all four formats and all three question origins — no change.
- `ai_verdict` check already allows only `accepted` / `rejected`, which is exactly the binary grade. No change.
- New partial unique index on `(student_id, source_result_id, question_id, response_kind)` where `source_result_id is not null`, so a double-submit can't create two grades for one question.
- Index on `(course_id, response_kind, created_at desc)` for professor analytics.

RLS is unchanged: students insert and read their own rows, professors read rows for their courses, admins read everything, edge functions write with the service role. Insert-only stands.

### 2. Question storage (`assessment_questions`, `diagnostic_questions`)

Both tables already carry `format` and `answer`, so a short-answer question needs no new column to exist. Two additions make it gradable and boundable:
- `model_answer` (text, nullable) — the fuller expected response. `answer` stays as the short canonical answer.
- `answer_max_words` (integer, nullable) — optional cap the UI enforces later.

Both null for MCQ / True-False rows, so existing rows are untouched.

A validation trigger (not a CHECK) asserts that a short-answer row carries no `options` and a non-empty `answer`, and that an MCQ row still has options — cheap protection against malformed generator output.

### 3. Question-mix control

`course_ta_settings` stores comma-separated type toggles (`quiz_question_mix`, `exam_question_mix`) with no counts. Add four jsonb columns, default `{}`, each shaped `{ "mcq": n, "true_false": n, "short_answer": n }`:
- `quiz_type_counts`, `exam_type_counts`, `diagnostic_type_counts`, `practice_type_counts`

Empty `{}` means "fall back to today's behaviour", so nothing changes until later phases read these. Per-exam overrides already have a home in `course_exams.breakdown` (jsonb), so no schema change there.

## Improvements worth taking

- **Snapshot the model answer on the grading row** (included above). Without it a professor editing a question silently rewrites the basis of every past grade.
- **Deterministic pre-check before the AI call** in Phase 2 — exact / normalised string match short-circuits both cost and non-determinism.
- **Cache the boolean grade into `assessment_results.answers` at submit time** so review screens never join against this table. The shape of `answers` doesn't change; only the existing correctness flag is populated from the grade.
- **Keep `ai_model_reasoning` populated for short answers too** — it already exists and is the only way to tell a bad grade from a bad question when a student disputes one.

## Risks and constraints

- **Overloaded verdict vocabulary.** `accepted`/`rejected` now means "valid reasoning" on one row kind and "correct answer" on another. Every consumer must read `response_kind` first. Anything today that counts verdicts without filtering will silently mix the two — the reasoning-weighted scoring path in `reasoning.ts` and `masteryScoring.ts` is the one to audit in Phase 6.
- **Insert-only means a wrong grade is permanent.** With no override, the only remedy for a disputed grade is voiding the attempt. Worth revisiting if disputes appear.
- **Grading latency.** One network call per short answer; a quiz with 8 of them is 8 calls unless Phase 2 batches them into a single request per submission. This is the same problem that sank the old weekly-quiz follow-up pass.
- **Branching cannot depend on short answers.** Diagnostic tier selection happens mid-quiz, but a short answer is only gradable after submission. Diagnostic branching stays MCQ/True-False driven.
- **Rationale widget overlap.** Bloom 3+ questions demand a written rationale today. Since a short answer *is* the reasoning, Phase 5 must suppress the rationale widget on short-answer questions or students get two textboxes.
- **Type regeneration.** Generated database types change and every file touching these tables recompiles. All new columns are nullable or defaulted, so existing rows stay valid.

## Next phases (not built yet)

2. `grade-short-answer` edge function — deterministic pre-check, batched AI grading, writes the graded row.
3. Generation: emit short-answer questions honouring the configured counts.
4. Professor settings UI for the per-format mix.
5. Student UI: free-text input, rationale widget suppressed, review screen with grader feedback.
6. Scoring, mastery and analytics integration, plus tests.
