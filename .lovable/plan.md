# Remove static question-bank fallback

## Goal

Stop serving hardcoded Python sample questions when a course has no professor-published exam or quiz. Make availability honest, so every assessment a student takes is authored (or AI-generated) for their actual course — which means `assessment_results.answers[].topic` always matches a real `concepts.concept_code` and `update-mastery` always writes the Concept Map.

## Changes

### 1. `src/pages/student/AIChat.tsx` — drop the fallbacks

- Remove the `getQuizQuestions` / `getExamQuestions` imports.
- `handleStartExam` and `handleStartExamWithSettings`: when `fetchDBQuestions("exam", …)` returns 0 questions, do **not** fall back. Toast `"Your professor hasn't published a practice exam for this course yet."` and abort (don't enter assessment mode, don't create a session).
- `handleStartQuiz` (currently orphan, but keep parity): same treatment — if no DB questions, toast `"No quiz available for this week yet."` and abort.
- Leave the rest of the exam-id rotation, week-visibility filter, and seeded shuffle logic alone; they already work correctly against `assessment_questions`.

### 2. `src/components/ExamPrepPanel.tsx` — gate the Start button

- When `examCount === 0`, disable **Start Exam Practice**, keep the existing `"Your professor hasn't published a practice exam yet"` line (drop the `— you'll get a sample set` suffix), and hide the customize-settings affordance (nothing to start).
- `Performance` button stays visible so past attempts remain reviewable.

### 3. `src/data/questionBank.ts` — keep the type, delete the data

- Delete the `questionBank` array and the `getQuizQuestions` / `getExamQuestions` helpers.
- Keep the `Question` interface export — `AssessmentView.tsx` and `WeeklyQuizDialog.tsx` import it as a type only. (Alternatively move the type into `src/types`, but keeping the file as a pure type module is the smallest diff.)

### 4. No DB or edge-function changes

The Concept Map bug auto-resolves: with the fallback gone, every answer carries a real `concept_code` from `assessment_questions` (enforced by the existing `assessment_questions_validate_topic` trigger), so `update-mastery` resolves and writes on every exam/quiz submit.

## Out of scope

- Backfilling the one historical sample exam (`fc807f41…`) into `student_concept_mastery`.
- Auto-generating a sample exam from course concepts when none exists (possible future Option 2; not needed now since professors generate exams during setup).
- Touching the diagnostic flow — it already uses its own DB-backed `diagnostic_questions` and doesn't read the question bank.
