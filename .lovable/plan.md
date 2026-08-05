# Retire "Topic" — standardize on "Concept"

## What "topic" means today

Three unrelated things share the word:

1. **Question tagging** — `assessment_questions.topic` and `diagnostic_questions.topic` are text columns that database triggers force to equal `concepts.concept_code`. They are an exact duplicate of the concept, under a different name.
2. **Lesson plan** — each week has a name/theme plus a "Topics Covered" list. That list is the week's concepts; the week name is just a label.
3. **Loose copy** — analytics column headers ("Topic"), result screens ("review these topics"), and AI prompt text.

## Decisions applied

- Rename user-facing wording and code identifiers; keep the database columns named `topic` (no migration, no data risk).
- Lesson plan: rename "Topics Covered" to "Concepts Covered". The week name/theme stays as-is.
- `assessment_results.answers` keeps its `topic` JSONB key so all historical results keep working; only the display label changes.

## Phase 1 — User-facing wording

Every visible string that says Topic/Topics becomes Concept/Concepts:

- Assessment analytics: "Topic Performance" table and its "Topic" column header.
- Diagnostics analytics (admin) per-topic breakdown headings.
- Assessment results screen: "review these topics", "Covers Week N topics", "Covers all course topics", weak-topic badges.
- Exam history, weekly quiz review, exam questions dialog, practice questions widget, question type selector, diagnostic setup, exam mode, assessments page.
- Lesson plan renderer: "Topics Covered" to "Concepts Covered".

## Phase 2 — AI prompt text

Update prompt wording in the edge functions so the model reasons in terms of concepts and its labels match the UI: `generate-weekly-quiz`, `generate-exam-questions`, `generate-diagnostic-questions`, `generate-practice-questions`, `suggest-concepts`, `recommend-additional-concepts`, `suggest-lesson`, `parse-syllabus`, `chat`.

The JSON field the model returns stays `topic` where a change would break the existing validator contract; where the validator is updated in Phase 3, the field is renamed to `concept_code` together with it.

## Phase 3 — Code identifiers

Rename variables, types, props, and object fields from `topic` to `conceptCode` (and `TopicPerformance` to `ConceptPerformance`, `weakTopics` to `weakConcepts`, `onStudyTopics` to `onStudyConcepts`, etc.) in:

- `src/components/AssessmentView.tsx`, `ExamHistory.tsx`, `ExamQuestionsViewDialog.tsx`, `PracticeQuestionsWidget.tsx`, `WeeklyQuizReviewDialog.tsx`, `QuestionTypeSelector.tsx`
- `src/pages/teacher/AssessmentAnalytics.tsx`, `Assessments.tsx`, `ExamMode.tsx`, `DiagnosticQuestionsSetup.tsx`, `ContentReview.tsx`
- `src/components/admin/DiagnosticsAnalytics.tsx`, `src/lib/diagnosticsAnalytics.ts`
- `supabase/functions/_shared/question-validation.ts`, `generate-weekly-quiz/followup.ts`, and the generator functions above

At each database boundary the column is mapped explicitly, e.g. `select("... topic ...")` then `conceptCode: row.topic`, and inserts write `topic: conceptCode`. Same for the `answers` JSONB: it is still written and read with the `topic` key.

Excluded from renaming: `lessonPlanShape.ts` `topic` field (that is the week name, not a concept) and `TeachingPlan.tsx` week-topic state.

## Phase 4 — Tests and verification

Update the affected test files (`diagnosticsAnalytics.test.ts`, `question-validation_test.ts`, `followup_test.ts`, `WeeklyQuizDialog.test.tsx`, sanitizer pipeline tests) to the new identifiers, then run the suite and a typecheck.

## Risks

- **Database column keeps the old name.** `assessment_questions.topic` and `diagnostic_questions.topic` stay, along with the triggers that keep them equal to `concepts.concept_code`. Code will read "concept" while the schema says "topic" — a documented mismatch, and removing it later needs a migration plus a rewrite of every historical `answers` row.
- **Wide, shallow diff.** Roughly 25 files change. Each rename is mechanical, but a missed database-boundary mapping produces `undefined` concept labels rather than a compile error, so the boundaries need checking one by one.
- **AI prompt changes affect generation.** Renaming a field in a model's output schema requires the validator to change in the same step or generation silently rejects every item. Prompt and validator are changed together per function.
- **Lesson plan ambiguity remains.** After this change a week still has a name and a concept list; "topic" simply stops being used for either.
