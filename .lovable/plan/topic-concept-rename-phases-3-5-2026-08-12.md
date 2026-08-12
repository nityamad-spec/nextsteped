# Topic → Concept rename: Phases 3–5

Phases 1 and 2 (user-visible labels) are done. This plan finishes the internal rename.

## Phase 3 — Frontend code identifiers

Rename variables, props, types, and local helpers from `topic*` to `concept*` in the frontend, while keeping every database column and API payload key named `topic`. The boundary is explicit: wherever data is read from or written to the backend, the object key stays `topic` and is mapped into a `concept` field in app code.

Files in scope (highest usage first): `AIChat.tsx`, `AssessmentAnalytics.tsx`, `AssessmentView.tsx`, `ExamHistory.tsx`, `ExamMode.tsx`, `TeachingPlan.tsx`, `Assessments.tsx`, `PracticeQuestionsWidget.tsx`, `StudentHome.tsx`, `DiagnosticQuiz.tsx`, `diagnosticsAnalytics.ts`, `admin/DiagnosticsAnalytics.tsx`, `DiagnosticQuestionsSetup.tsx`, `unitStage.ts`, `useUnitProgress.ts`, `ContentReview.tsx`, `StudentLearningPath.tsx`, `lessonPlanShape.ts`, `types/index.ts`, `useShortAnswerGrading.ts`, `UnitPathwayCard.tsx`, `WeeklyQuizReviewDialog.tsx`, `ExamQuestionsViewDialog.tsx`, `buildReasoningRows.ts`.

Untouched: `src/integrations/supabase/types.ts` (auto-generated), and the `{topic}` deep-link template placeholder in `AIChat.tsx` unless the matching handler is renamed in the same edit.

## Phase 4 — Edge function prompt prose

Update prompt wording in AI-calling functions so the model reasons in terms of "concept": `suggest-concepts`, `generate-diagnostic-questions`, `generate-weekly-quiz`, `generate-exam-questions`, `generate-practice-questions`, `suggest-lesson`, `recommend-additional-concepts`, `parse-syllabus`, `chat`, `classify-question`, `quality-check`, `grade-short-answer`.

JSON schema keys stay `topic` in every request and response contract, so no stored question or result changes shape. Validation logic in `_shared/question-validation.ts` keeps reading the `topic` key; only its prose messages change.

## Phase 5 — Verification

- Typecheck the app.
- Run the full vitest suite and compare against the current baseline (one pre-existing `StudentHome.test.tsx` failure).
- Run the edge function Deno tests for the shared validation and sanitizer suites.
- Spot-check in the browser: student learning path, student home, weekly quiz review, teacher lesson plan, diagnostic setup, exam mode.
- Final grep to confirm no `topic` identifiers remain outside the documented DB/API boundary.

## Technical notes

- No database migration, no column rename, no data backfill.
- Renames are mechanical but touch shared types; each file is edited then typechecked in batches to catch prop mismatches early.
- Risk: the lesson plan JSON stored in `lesson_plan_weeks.concepts` and syllabus JSON blobs use `topic` keys — parsers keep reading those keys verbatim.
- Per project rule, any test or typecheck failure is reported rather than auto-fixed.
