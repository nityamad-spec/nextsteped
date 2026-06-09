# Remove confidence collection from weekly quizzes, exams, and practice questions

## Current state
- `AssessmentView` (shared by weekly quizzes via `WeeklyQuizDialog` and exams via `AIChat` exam-prep mode) unconditionally renders a "How confident are you?" selector for every question (lines 280–315) and ships the values in `AssessmentResults.confidences`.
- `WeeklyQuizDialog` persists those values into `assessment_results.confidences`.
- `PracticeQuestions` / `PracticeQuestionsWidget` already don't collect confidence — nothing to change there.
- `DiagnosticQuiz` has its own confidence flow (separate component); diagnostics are NOT in scope for this change and keep their behavior.

## Change
1. **`src/components/AssessmentView.tsx`** — delete the confidence UI block (lines ~280–315), remove `confidences` state + `ConfidenceLevel` type local usage, and drop the field from `AssessmentResults`/`onSubmit` payload (export an empty-typed shape if other code reads it).
2. **`src/components/WeeklyQuizDialog.tsx`** — remove `confidences: results.confidences ?? {}` from the `assessment_results` insert. The DB column stays (free-form JSON) but we write `{}` or omit it.
3. **`src/pages/student/AIChat.tsx`** — if it reads `results.confidences` from `AssessmentView` for exams, drop those reads / inserts.
4. **`src/components/WeeklyQuizDialog.test.tsx`** — update any assertion that expects a confidence map.

## Out of scope
- `DiagnosticQuiz.tsx`, `score-diagnostic`, `diagnosticsAnalytics`, `admin/DiagnosticsAnalytics` — diagnostic flow keeps confidence.
- DB schema: `assessment_results.confidences` column stays (no migration). It just won't receive new data from quizzes/exams.

## Verification
- Open Week-3 statistics weekly quiz on `/student/home` — no confidence buttons.
- Start an exam from AI Chat exam-prep mode — no confidence buttons.
- Practice questions remain unchanged.
- Diagnostic quiz still shows confidence as before.
