

## Plan: Enable/Disable Daily Quiz and Exam Mode

### Problem
The `examApproved` and `quizApproved` flags already exist in `course_ta_settings` and are persisted, but they are never checked on the student side. Students can always start exams and quizzes regardless of the teacher's approval state.

### Approach

**1. `src/pages/student/AIChat.tsx`** — Gate assessment start buttons behind `taSettings`
- Hide or disable the "Start Exam" button when `taSettings.examApproved` is `false`
- Hide or disable the "Start Daily Quiz" button when `taSettings.quizApproved` is `false`
- In the auto-start `useEffect` (lines 61-68), skip auto-starting if the corresponding flag is `false`
- Show a small info message when disabled (e.g., "Your professor has not enabled this assessment yet")

**2. `src/pages/student/StudentHome.tsx`** — Gate quiz/exam cards in the lesson plan
- Fetch `taSettings` using `useTASettings(enrolledCourseId)`
- Hide/disable the "Daily Quiz — Day X" card when `quizApproved` is `false`
- Hide/disable the "Final Exam" card when `examApproved` is `false`
- Show a lock indicator with "Not yet available" text

**3. `src/pages/teacher/ExamMode.tsx`** — No changes needed
- The `examApproved` and `quizApproved` toggles already exist and persist correctly

### Files Modified
- `src/pages/student/AIChat.tsx` — check `taSettings.examApproved` / `quizApproved` before allowing assessment start
- `src/pages/student/StudentHome.tsx` — conditionally render quiz/exam entry points based on `taSettings`

