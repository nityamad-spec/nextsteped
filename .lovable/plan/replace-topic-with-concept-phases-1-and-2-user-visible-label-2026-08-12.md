# Replace "Topic" with "Concept" — Phases 1 and 2 (user-visible labels)

Scope for this round: only the text a student or professor reads. No code identifier renames, no edge function changes, no database changes. The `topic` DB columns and payload keys stay exactly as they are — the rendered value is unchanged, only the surrounding label wording changes.

## Phase 1 — Student-facing labels

- `ExamHistory.tsx`: "Topics to Focus On" -> "Concepts to Focus On".
- `PracticeQuestionsWidget.tsx`: "Topics to review" -> "Concepts to review"; any "topic" wording in the history/results summary.
- `AIChat.tsx` suggested prompts:
  - "Quiz me": "…on your recent topics" -> "…on your recent concepts".
  - "Search course materials": "on topic X" -> "on concept X" (and the same in the editable template).
  - "Prep for the exam": "What topics should I focus on…" -> "What concepts should I focus on…".
  - Practice/weak-area chat messages that say "Focus next on" stay as-is (no "topic" word).
- `DiagnosticQuiz.tsx`, `PracticeQuestions.tsx`, `AssessmentView.tsx`, `WeeklyQuizReviewDialog.tsx`: question badges already render the raw value with no label — check for any "Topic:" prefix and switch to "Concept:".
- `StudentLearningPath.tsx` / `StudentHome.tsx` / `UnitPathwayCard.tsx`: any visible "topic" copy in card descriptions and empty states.

## Phase 2 — Teacher and admin labels

- `AssessmentAnalytics.tsx`: card title "Topic Performance" -> "Concept Performance"; table column header "Topic" -> "Concept".
- `Assessments.tsx`: question form field label "Topic" -> "Concept"; validation toast `Topic "X" must match an existing course concept code.` -> `Concept "X" must match an existing course concept code.`
- `CourseCreation.tsx`: "Topics Covered" -> "Concepts Covered"; "Topic moved" toast -> "Concept moved"; the fallback string `"Topic"` used when a name is missing -> `"Concept"`.
- `ContentReview.tsx`: "Topic" input label -> "Concept".
- `TeachingPlan.tsx`: section heading "Concepts & Topics" -> "Concepts"; the per-day edit field label "Topic" -> "Concept". The heading **parser** must keep matching the legacy strings "Concepts & Topics" and "Concepts and Topics" in addition to the new one, or previously generated plans render blank.
- `ConceptReview.tsx`, `ExamMode.tsx`, `DiagnosticQuestionsSetup.tsx`, `DiagnosticsAnalytics.tsx`, `CourseAnalyticsView.tsx`: sweep for any remaining visible "topic" wording in labels, headers, tooltips and empty states.

## What is explicitly not touched

- Variable, prop, type and function names (`weakTopics`, `TopicPerformance`, `formTopic`, …) — deferred to phase 3.
- Edge function prompts and JSON schema keys — deferred to phase 4.
- `assessment_questions.topic`, `diagnostic_questions.topic`, `student_answer_rationales.topic` and the `topic` key in question payloads.
- `src/integrations/supabase/types.ts` (auto-generated).

## Verification

- Typecheck plus the existing vitest suite (label strings are not asserted in tests, but the run confirms nothing broke).
- Browser pass over `/student/home`, `/student/learning-path`, `/student/chat`, `/teacher/setup/lesson-plan`, `/teacher/assessments` and the assessment analytics page: confirm the new wording appears and the concept/topic badges still show their values.
- Confirm an existing AI-generated teaching plan still renders its "Concepts & Topics" section after the heading change.

## Risks

- **Legacy plan parsing** in `TeachingPlan.tsx` is the only real breakage risk; mitigated by keeping both legacy spellings accepted.
- **Mixed vocabulary** disappears for the user after these two phases, but the code will still read `topic` internally until phase 3.
