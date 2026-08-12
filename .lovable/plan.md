# Replace "Topic" with "Concept" across the platform

The word "topic" appears roughly 800 times across 38 frontend files and 32 edge functions. It is used in three distinct ways today:

1. **Display labels** students and professors read ("Topic Performance", "Topics to review", "Topics Covered", question badges).
2. **Code identifiers** in the frontend (`topicPerformance`, `weakTopics`, `ConceptTopic`, `normaliseTopic`, `fetchVisibleTopics`, `formTopic`, ...).
3. **Database columns and API payload fields** — `assessment_questions.topic`, `diagnostic_questions.topic`, `student_answer_rationales.topic`, plus the `topic` key on every question object returned by the generator edge functions.

Per the decisions made: rename (1) and (2) to Concept/Concepts, update AI prompt wording, include legacy teacher pages, and **leave the database columns and cross-boundary payload keys named `topic`**. This keeps the rename zero-downtime and avoids a migration on hot assessment tables.

## Boundary rule

The `topic` field name stays wherever it crosses a wire or a table:

```text
DB column  assessment_questions.topic   -> unchanged
edge fn    { topic: "Regular Languages" } -> unchanged (payload key)
frontend   mapped at read time into `concept`/`conceptName` locals
UI text    "Concept" / "Concepts"
```

Each frontend file maps the incoming `topic` key into concept-named locals at the point it reads the row, then uses concept naming from there on. One narrow adapter layer instead of a schema change.

## Phase 1 — Student-facing labels

Files: `StudentHome.tsx`, `StudentLearningPath.tsx`, `AIChat.tsx`, `DiagnosticQuiz.tsx`, `PracticeQuestionsWidget.tsx`, `PracticeQuestions.tsx`, `ExamHistory.tsx`, `WeeklyQuizReviewDialog.tsx`, `AssessmentView.tsx`, `ConceptMasteryDialog.tsx`, `UnitPathwayCard.tsx`.

- "Topics to review" -> "Concepts to review", "Topics to Focus On" -> "Concepts to Focus On".
- Suggested chat prompts in `AIChat.tsx`: "on topic X" -> "on concept X", "What topics should I focus on" -> "What concepts should I focus on", and the `{topic}` template placeholder becomes `{concept}`.
- Question badges keep rendering the same value, just sourced from a concept-named local.

## Phase 2 — Teacher and admin labels

Files: `AssessmentAnalytics.tsx` ("Topic Performance" card + column header), `Assessments.tsx` (Topic select + validation toast), `CourseCreation.tsx` ("Topics Covered", "Topic moved" toast), `ContentReview.tsx`, `TeachingPlan.tsx` ("Concepts & Topics" -> "Concepts", the per-day Topic input), `ConceptReview.tsx`, `ExamMode.tsx`, `DiagnosticQuestionsSetup.tsx`, `DiagnosticsAnalytics.tsx`, `CourseAnalyticsView.tsx`.

`TeachingPlan.tsx` parses AI section headings by string match on "Concepts & Topics" / "Concepts and Topics" — the parser must keep accepting both legacy spellings while emitting the new heading, otherwise previously generated plans stop rendering.

## Phase 3 — Frontend code identifiers

Rename variables, props, interfaces and helpers: `TopicPerformance` -> `ConceptPerformance`, `weakTopics` -> `weakConcepts`, `wrongTopics` -> `wrongConcepts`, `formTopic` -> `formConcept`, `editTopic` -> `editConcept`, `normaliseTopic` -> `normaliseConcept`, `fetchVisibleTopics` -> `fetchVisibleConcepts`, `filterByVisibleTopics` -> `filterByVisibleConcepts`, `currentWeekTopic` -> `currentWeekConcept`, `ConceptTopic` -> `ConceptDefinition` in `src/types/index.ts`.

Touches `src/lib/unitStage.ts`, `src/lib/reasoning.ts`, `src/lib/buildReasoningRows.ts`, `src/lib/diagnosticsAnalytics.ts`, `src/hooks/useUnitProgress.ts` and their tests. `LearningPlanWeek.topic` in `useLearningPlan.ts` is a week title, not a concept — rename it to `title` in the same pass so the word disappears entirely.

`src/integrations/supabase/types.ts` is auto-generated and is not edited.

## Phase 4 — Edge function prompt wording

Files with AI prompt text: `generate-weekly-quiz`, `generate-exam-questions`, `generate-diagnostic-questions`, `generate-practice-questions`, `generate-question-metadata`, `suggest-concepts`, `recommend-additional-concepts`, `suggest-lesson`, `generate-lesson-plan`, `regenerate-lesson-plan-week`, `extract-lesson-plan`, `parse-syllabus`, `quality-check`, `explain-answers`, `evaluate-reasoning`, `grade-short-answer`, `classify-question`, `chat`.

Prompt prose changes to "concept". **Tool-call / JSON schema property names stay `topic`** in every generator, because the response is written straight into the `topic` DB column and validated against it — renaming the schema key would silently drop the value. The same applies to `_shared/question-validation.ts`, `_shared/rag-intent.ts` and `_shared/conversational-intent.ts`, whose keyword lists and field names stay as-is.

## Phase 5 — Verification

- `tsgo` typecheck plus the existing vitest suite (`unitStage`, `buildReasoningRows`, `diagnosticsAnalytics`, `useUnitProgress`, reasoning integration).
- Deno tests for the edge functions touched in phase 4.
- Browser pass over `/student/home`, `/student/learning-path`, `/student/chat`, `/teacher/setup/lesson-plan` and `/teacher/assessments` to confirm labels changed and question badges still populate.
- Regenerate one weekly quiz and one diagnostic set to confirm prompt edits did not break the tool-call contract.

## Risks

- **Prompt drift**: rewording prompts can change AI output shape. Mitigated by leaving all JSON schema keys untouched and regenerating one of each artifact in phase 5.
- **Legacy lesson plan parsing**: `TeachingPlan.tsx` heading match must stay backward-compatible or old plans render blank.
- **Mixed vocabulary window**: between phases the app shows both words. Phases 1 and 2 are safe to ship together to shorten it.
- **DB stays `topic`**: future readers will see `topic` in the schema and `concept` in the UI. A short comment at each mapping site records why.
