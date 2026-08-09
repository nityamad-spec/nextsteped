# Per-week quiz format mix + immediate short-answer grading

Two changes, both scoped to weekly quizzes.

## 1. Per-week Question Format Mix (lesson plan page)

Inside each week's Weekly Quiz card on `/teacher/setup/lesson-plan`, add a compact "Question Format Mix" control:

- Three rows — Multiple Choice, Short Answer, True / False — each with minus/plus steppers moving in 10% steps.
- Defaults to 40% MCQ, 40% short answer, 20% true/false for every week.
- Total always stays at 100: increasing one bucket takes from the largest other bucket, decreasing gives back. No invalid state is reachable, so no error message is needed.
- Live preview of resulting counts across the 10 primary questions a student sees, e.g. "4 multiple choice, 4 short answer, 2 true/false".
- The mix is saved per week, so weeks can differ.
- If that week already has a generated quiz, a small note appears: the new mix applies the next time the quiz is regenerated. Nothing is regenerated automatically.

## 2. Weekly quiz generation supports three formats

`generate-weekly-quiz` currently hard-codes MCQ and true/false. It will:

- Read the week's saved mix and convert it to per-tier format quotas. Each tier generates 5 questions, so the mix is applied per tier (rounded with largest-remainder so each tier's totals still add up).
- Ask the model for those exact per-format counts and accept short answer items.
- Validate per format: MCQ needs 4 balanced options and a valid answer; true/false needs exactly True/False; short answer must carry no options plus a model answer and a suggested max word count.
- Retry a tier when the returned format counts miss the quota, reusing the existing tier retry loop.

## 3. Immediate short-answer grading during the quiz

When a student answers a short-answer question and moves on:

1. The answer is recorded as a short-answer response.
2. `grade-short-answer` is called immediately in the background. Grading is silent — the student sees no verdict and never waits.
3. Verdicts are used as the correctness signal for those questions at scoring time.

Pending grades are awaited (with a time budget, never indefinitely) at submission, alongside the existing reasoning-evaluation flush. If a verdict has not landed in time or grading is unavailable, that question falls back to the current text comparison against the model answer.

Short-answer questions do not show the separate reasoning textarea — the answer box is the response. MCQ and true/false keep the reasoning box unchanged at Bloom 3+.

## Risks and constraints

- **Existing weekly quizzes are all MCQ/true-false.** The mix only takes effect on regeneration, per your choice. Each week must be regenerated individually to pick up its mix.
- **10 questions with 10% steps** maps cleanly (each 10% = 1 question) at the quiz level, but the mix is applied per 5-question tier, so a 10% bucket can round to 0 in some tiers while appearing in others. The per-tier rounding keeps the overall quiz close to the chosen mix, not exactly equal to it.
- **Extra model cost per attempt**: roughly one grading call per short answer, so about 4 extra calls per student per quiz at the default mix.
- **Rationale rows are insert-only** — a grade is written once and cannot be re-graded without a schema change.
- Generation time may rise slightly because short-answer items need a model answer, but the format count stays the same.

## Technical notes

- New JSONB column `quiz_type_counts` on `lesson_plan_weeks`, defaulting to null; null is read as the 40/40/20 default. Saved from `CourseCreation.tsx` alongside other week edits and included in the publish upsert in `src/lib/lessonPlanWeeks.ts`.
- Reuses `src/lib/questionMix.ts` (`adjustMix`, `allocateFormats`, `normalizeMix`) and its edge-function mirror `supabase/functions/_shared/question-mix.ts` — no new mix maths.
- `assessment_questions.model_answer` / `answer_max_words` and the `validate_question_format_shape` trigger already exist, so no question-table migration is needed.
- Files touched: `src/pages/teacher/CourseCreation.tsx`, `src/lib/lessonPlanWeeks.ts`, `supabase/functions/generate-weekly-quiz/index.ts`, `src/components/WeeklyQuizDialog.tsx`, `src/components/AssessmentView.tsx` (short-answer grading hook wiring + hide reasoning box on short answers), reusing `src/hooks/useShortAnswerGrading.ts`.
- Unit tests for per-tier mix allocation and for the grading fallback path.
