# Close the short-answer validation gaps

Short-answer questions already pass through most of the shared question-quality pipeline (structure, concept mapping, difficulty band, Bloom level, deduplication, quota audit). What is missing is the semantic quality layer that MCQ and true/false get, plus a single shared home for the rules. This plan closes all of it.

## 1. One shared validator for short answer

Move the short-answer rules out of the three generator files and into the shared validation module, so weekly quiz, exam, and diagnostic all run identical checks and cannot drift again. Today diagnostic's copy already differs — it skips the model-answer length bounds the other two enforce.

Rules the shared validator will enforce:

- Reference answer present, at most 30 words.
- No options attached.
- Model answer present, 20 to 1200 characters.
- Suggested word budget clamped to 20-120, defaulting to 60.

## 2. New quality checks for short answer

Three checks MCQ and true/false effectively have but short answer does not:

- **Explanation must agree with the answer.** Right now a short-answer explanation only has to be non-empty and 15+ characters. It will need to share key terms with the reference/model answer, the same token-overlap test MCQ uses against its correct option.
- **Model answer must agree with the reference answer.** A concise reference answer that contradicts the fuller model answer currently passes and would cause inconsistent AI grading later. Both must overlap on key terms.
- **The stem must not give away the answer.** A short-answer question whose text already restates the reference answer verbatim is rejected. MCQ gets this protection indirectly through option-parity; short answer has none.

Each rejection produces a specific reason string so it appears in the existing per-tier rejection summaries and retry hints, and the generators' slot-reservation retry loops refill the missed slots exactly as they do for other formats today.

## 3. Practice questions gain short answer

`generate-practice-questions` still allows only MCQ and true/false, so short answer never appears in practice. It will accept the format, apply the same shared validation, and respect the practice format mix already stored per course.

## 4. Test coverage

Add short-answer cases to the shared validator test suite, mirroring the existing MCQ/true-false tests: missing model answer, over-long reference answer, options present on a short answer, explanation that contradicts the answer, model answer that contradicts the reference answer, answer leaked in the stem, and a clean question that passes.

## Risks and constraints

- **Stricter validation means more rejections.** Adding three checks will reject a share of generated short answers, which the retry loop must refill. Expect somewhat longer generation times and slightly higher model cost per quiz/exam. The checks are token-overlap based and deliberately lenient to limit false rejections, but some good questions will be dropped.
- **Existing questions are untouched.** Nothing already in the database is re-validated or removed; the new rules only apply to future generation.
- **Practice short answers need grading.** Practice questions run client-side; enabling short answer there means practice items with no automatic verdict unless the practice widget also calls `grade-short-answer`. This plan wires practice to the same background grading path used by quizzes and exams.
- **Token-overlap checks are heuristics.** They catch clear contradictions, not subtle wrongness. Deep correctness remains the job of `grade-short-answer` at attempt time.

## Technical notes

- New exported helpers in `supabase/functions/_shared/question-validation.ts`: `validateShortAnswer(...)` for the structural/length rules and an extension of `validateExplanation` covering `short_answer` (answer-token overlap, reusing `topAnswerTokens` / `tokenize`), plus a stem-leakage guard.
- Call sites replaced with the shared helper: `generate-weekly-quiz/index.ts` (~lines 238-255), `generate-exam-questions/index.ts` (~lines 238-255), `generate-diagnostic-questions/index.ts` (~lines 330-345).
- `generate-practice-questions/index.ts`: add `short_answer` to `allowedFormats`, the intent type list, the model JSON schema (`model_answer`, `answer_max_words`), and the returned item shape; wire `PracticeQuestions.tsx` / `PracticeQuestionsWidget.tsx` to `useShortAnswerGrading`.
- Tests added to `supabase/functions/_shared/question-validation_test.ts` (Deno).
- No database migration — `model_answer` / `answer_max_words` and the `validate_question_format_shape` trigger already exist.
