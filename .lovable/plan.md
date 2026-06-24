## Goal
Archived mock tests must never be presented to students as a live, takeable exam, and must never appear in any "live" list on the teacher side. They remain visible only in clearly-labelled archived/history sections and in past attempt records.

## Current state (audit)

Already correct:
- `useCourseExams` cleanly splits `active` vs `archived`.
- Teacher `ExamMode` only hydrates `examSchedule` from `activeCourseExams`; archived shown in a separate collapsible.
- Student `AIChat.loadAvailableExamIds` intersects generated `exam_id`s with `course_exams` where `archived_at IS NULL`.
- `ExamHistory` shows an "This exam was archived" badge on past attempts (kept — historical).

Gaps (this plan):

1. **Legacy fallback in student AIChat** (`src/pages/student/AIChat.tsx` ~L465–475). When `course_exams` is empty for an older course, the code falls back to `taSettings.examSchedule` JSON. That JSON was written before the archive table existed and can include archived/removed exams, so an archived exam can still appear in the student's exam rotation.
2. **Stale `examSchedule` JSON kept in `course_ta_settings`**. Saving from `ExamMode` already only persists active items going forward, but historical rows still contain archived ids. Nothing prunes them.
3. **Teacher Assessments question bank** (`src/pages/teacher/Assessments.tsx` L103). `examQuestions = questions.filter(mode === "exam")` lists every exam question regardless of whether its `exam_id` is archived. They render alongside live exam questions with no archived indicator.
4. **`generate-exam-questions` edge function** has no guard preventing (re)generation against an archived `exam_id`.
5. **Student `ExamPrepPanel` count** is driven by `availableExamIds.length`. Correct today, but only because of #1's fallback — once #1 is tightened, the panel correctly reads zero for archived-only courses.

## Changes

### A. Stop trusting legacy `examSchedule` for live rotation
File: `src/pages/student/AIChat.tsx` (`loadAvailableExamIds`)
- Drop the `taSettings.examSchedule` fallback path.
- New rule: if `course_exams` returns zero rows for the course, treat the live exam list as empty (`availableExamIds = []`). `ExamPrepPanel` will correctly say "Your professor hasn't published a practice exam yet."
- Keep filtering generated `exam_id`s against `course_exams.id WHERE archived_at IS NULL` (already in place).

### B. Prune archived ids from `taSettings.examSchedule` on save
File: `src/pages/teacher/ExamMode.tsx` save path (already builds from `activeCourseExams`, but make it explicit & defensive):
- Before `saveTASettings`, filter `examSchedule` to ids present in `activeCourseExams` (drops any stale archived id still lingering from old saves).
- One-shot self-heal on load: if `taSettings.examSchedule` contains ids not in `activeCourseExams`, write the pruned version back.

### C. Teacher Assessments question bank: hide / badge archived-exam questions
File: `src/pages/teacher/Assessments.tsx`
- Fetch `course_exams` for the current course (reuse `useCourseExams`).
- Build a `Set<archivedExamId>`.
- By default, exclude exam questions whose `exam_id` is archived from the visible "Exam questions" list.
- Add a "Show questions from archived exams" toggle (off by default) that, when on, re-includes them with an "Archived" badge so the teacher can still review/clean up if needed.

### D. Guard generation against archived exams
File: `supabase/functions/generate-exam-questions/index.ts`
- Before generation, look up `course_exams` row for `exam_id`. If `archived_at IS NOT NULL`, return 409 with `{ error: "exam_archived" }`.
- Surface a friendly toast in any caller ("This exam is archived — restore it before regenerating questions.").

### E. (No change) ExamHistory & AssessmentAnalytics
Past attempts intentionally remain visible with their existing archived badge — these are records, not live tests.

## Out of scope
- No DB migration. `course_exams.archived_at` already exists and is the source of truth.
- No deletion of archived `assessment_questions` rows — preserves past attempt links.
- No changes to weekly quiz flow.

## Verification
1. As teacher: create Final 1, generate questions, archive it. Student exam rotation goes to zero; `ExamPrepPanel` shows the "not published yet" copy.
2. Add Final 2, generate, leave active. Archive Final 1. Student sees only Final 2 in rotation; Teacher Assessments bank hides Final 1 questions unless the new toggle is on.
3. Restore Final 1: it reappears in active schedule and student rotation; bank shows its questions again without toggle.
4. Attempt to regenerate questions for an archived exam id via the edge function: returns `exam_archived`.
5. Past student attempts of Final 1 still appear in `ExamHistory` with the existing "This exam was archived" badge.
