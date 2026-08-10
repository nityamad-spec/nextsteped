# Remove the AI Assistant Settings step from Course Setup

The "AI Assistant Settings" step only stores a custom Study Mode prompt that no backend function reads today (no edge function references `custom_study_prompt`). Removing it shortens the setup pipeline from 8 cards to 7 and drops dead data.

## Resulting pipeline

```text
Upload Materials -> Concept Review -> Lesson Plan -> Project Lab (optional)
-> Diagnostic Quiz -> Exam Mode -> Enrollment & Course Settings
```

## What changes

Course Setup hub (`src/pages/teacher/CourseSetup.tsx`)
- Remove the `ai-settings` card, its status seeds/defaults, and the `custom_study_prompt` completion probe (the `course_ta_settings` query keeps only `exam_enabled, exam_approved`).
- Remove `Bot` icon import if unused.

Navigation
- `DiagnosticQuestionsSetup.tsx`: next step becomes `/teacher/setup/exam-mode` with label "Next: Exam Mode Settings".
- `App.tsx`: delete the `/teacher/setup/ai-settings` route and the legacy `/teacher/settings` redirect, plus the `AIAssistantAndSettings` and `AITASettings` imports.
- `src/components/SetupProgressBar.tsx`: remove the "AI Assistant" entry (legacy component still used by ConceptManagement / PublishEnrollment; step indexes there are reviewed so the bar stays coherent).

Pages deleted
- `src/pages/teacher/AIAssistantAndSettings.tsx`
- `src/pages/teacher/AITASettings.tsx` (already unrouted/dead)

Settings model cleanup
- `src/hooks/useTASettings.ts`: drop `custom_study_prompt` from the row type, the mapper, and the save payload.
- `src/types/index.ts`: remove `customStudyPrompt`.
- `src/data/mockData.ts`: remove `customStudyPrompt` default. `defaultStudyPrompt` / `studySystemPrompt` stay — they are the system prompt shown elsewhere.

Database
- One migration: `ALTER TABLE public.course_ta_settings DROP COLUMN custom_study_prompt;`
- Generated `src/integrations/supabase/types.ts` refreshes after the migration is applied.

Progress records
- Existing `teacher_setup_progress` rows with `step_id = 'ai-settings'` are harmless (the hub only reads known step ids), so they are left in place rather than deleted.

## Navigation testing

- Typecheck (`tsgo`) plus the existing vitest suite.
- Browser pass through the pipeline as a signed-in professor: `/teacher/setup` renders 7 cards with no AI Assistant card and correct lock/complete badges; Diagnostic -> "Next" lands on Exam Mode; Exam Mode -> Enrollment; every "Back to Course Setup" returns to the hub.
- Confirm `/teacher/setup/ai-settings` and `/teacher/settings` now render the app's 404 route and that no console errors appear.
- Confirm the teacher sidebar and `useTeacherSetupStatus` gating are unaffected (neither references this step).

## Risks

- Any professor-authored custom study prompt text is permanently deleted with the column. Nothing consumes it today, so behaviour of the student TA is unchanged.
- `SetupProgressBar` step numbering is used by two legacy pages; those indexes are adjusted in the same change to avoid an off-by-one highlight.
- Bookmarks to `/teacher/settings` will 404 by design.
