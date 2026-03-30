

## Plan: Decouple Exam/Quiz Enable from Settings Approval

### Current Problem
Exam and quiz availability for students is tied to `examApproved` and `quizApproved` — flags that were designed to confirm settings during the setup wizard. This creates issues:
- Teachers cannot disable exams/quizzes after publishing without un-approving their settings
- There is no quick on/off toggle accessible from the post-setup dashboard
- The "approval" concept conflates two concerns: "I've reviewed these settings" vs "students can access this right now"

### Proposed Approach: Separate Enable Flags

Add two new boolean columns — `exam_enabled` and `quiz_enabled` — to `course_ta_settings`. These are independent from the approval flags:

- **`examApproved` / `quizApproved`** → "Teacher has reviewed and locked these settings" (setup wizard gate)
- **`exam_enabled` / `quiz_enabled`** → "Students can currently access this assessment" (runtime toggle)

### Changes

**1. Database migration** — Add `exam_enabled` and `quiz_enabled` columns
- `exam_enabled BOOLEAN NOT NULL DEFAULT false`
- `quiz_enabled BOOLEAN NOT NULL DEFAULT false`
- Backfill: set them to match the current `exam_approved` / `quiz_approved` values so existing courses retain their current student-facing state

**2. `src/types/index.ts`** — Add `examEnabled` and `quizEnabled` to the `TASettings` type

**3. `src/hooks/useTASettings.ts`** — Map the new DB columns in `dbToAppSettings` and `saveTASettings`

**4. `src/data/mockData.ts`** — Add `examEnabled: false` and `quizEnabled: false` to `defaultTASettings`

**5. `src/pages/teacher/ExamMode.tsx`** — Add enable/disable toggles
- Add a prominent Switch or toggle for "Enable Exam for Students" and "Enable Daily Quiz for Students" — separate from the approval buttons
- Auto-enable when the teacher approves (first time), but allow independent toggling afterward
- When disabled, show a clear indicator that students cannot access the assessment

**6. `src/pages/teacher/CourseDashboard.tsx`** — Add quick-toggle cards
- Add a small "Assessment Controls" section with two switches: "Exam Enabled" and "Daily Quiz Enabled"
- Toggling saves directly to `course_ta_settings` without navigating to the Exam Mode page
- This gives teachers a fast way to enable/disable from their main dashboard

**7. `src/pages/student/StudentHome.tsx`** — Gate on `taSettings.examEnabled` / `quizEnabled` instead of `examApproved` / `quizApproved`

**8. `src/pages/student/AIChat.tsx`** — Gate assessment auto-start on `examEnabled` / `quizEnabled` instead of approval flags

### Summary
- `approved` = teacher has finalized the configuration (setup wizard)
- `enabled` = students can access right now (runtime toggle)
- Teachers get a quick toggle on the Course Dashboard for day-to-day control

### Files Modified
- 1 new database migration
- `src/types/index.ts`
- `src/hooks/useTASettings.ts`
- `src/data/mockData.ts`
- `src/pages/teacher/ExamMode.tsx`
- `src/pages/teacher/CourseDashboard.tsx`
- `src/pages/student/StudentHome.tsx`
- `src/pages/student/AIChat.tsx`

