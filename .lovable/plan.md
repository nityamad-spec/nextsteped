# Decouple Weekly Quiz from Chat

Today, clicking **Take Quiz** in the lesson plan on `/student/home` navigates to `/student/chat?mode=quiz&day=N`, which forces the AI Chat page to mount, swap into exam-mode UI, hide the chat, and render `AssessmentView` full-screen. The quiz is structurally tangled with chat session state, mode tabs, leave-warning dialogs, and a separate "weekly quiz prompt" that pops up on chat open.

Goal: make the weekly quiz fully self-contained. Clicking **Take Quiz** opens a modal dialog over the lesson plan, the student takes the quiz, results are saved + mastery updated, then the modal closes — no navigation, no chat involvement.

## What changes

### 1. New component `src/components/WeeklyQuizDialog.tsx`
A controlled full-screen `Dialog` that owns the entire weekly quiz lifecycle:
- Props: `open`, `onOpenChange`, `courseId`, `studentId`, `day`, `taSettings` (for `quizNumQuestions`, `quizTimeLimit`).
- On open: fetches questions via the same logic currently in `AIChat.handleStartQuiz` — `assessment_questions` filtered by `course_id`, `mode='daily_quiz'`, `quiz_day`, seeded-shuffled, sliced to `quizNumQuestions`; falls back to `getQuizQuestions` from `@/data/questionBank` if DB is empty.
- Renders `<AssessmentView type="quiz" .../>` inside `<DialogContent>` sized to ~`max-w-4xl h-[90vh]` with internal scroll.
- On `onSubmit`: inserts into `assessment_results` (mode=`daily_quiz`, `quiz_day=day`) and fires `update-mastery` (source `weekly_quiz`) — same payload shape as today. No chat-message side effect.
- On `onEnd` or dialog close while a quiz is active: shows the existing leave-warning confirm; on confirm closes the dialog without submitting.
- Shows a small intro state (concept coverage + question count + time limit) before the student clicks **Start Quiz**, matching the current `AssessmentView` intro phase (already built into `AssessmentView`).

### 2. `src/pages/student/StudentHome.tsx`
- Add local state `quizDialog: { open: boolean; day: number | null }`.
- Replace the `navigate("/student/chat?mode=quiz&day=...")` call on the **Take Quiz** button with `setQuizDialog({ open: true, day: dp.day })`.
- Render `<WeeklyQuizDialog open={quizDialog.open} day={quizDialog.day} onOpenChange={...} courseId={enrolledCourseId} studentId={user.id} taSettings={taSettings} />` once at the bottom of the page.
- `taSettings` is already available via `useTASettings(enrolledCourseId)` already imported here.

### 3. `src/pages/student/AIChat.tsx` — remove quiz coupling
- Delete `showWeeklyQuizPrompt`, `currentWeek`, and the `useEffect` that decides whether to pop the "Weekly Quiz available" dialog (lines ~110-172).
- Delete the URL-driven `handleStartQuiz` branch in the mount effect (lines ~271-280). `mode=exam` handling stays.
- Drop `handleStartQuiz` and the quiz-related JSX block: the `<Dialog>` at ~line 1117 that offered the in-chat quiz launcher.
- `assessmentType` state can stay narrowed to `"exam"` only (or be removed entirely along with the `quiz` branch in `handleAssessmentSubmit`), since chat now only runs exam-mode assessments. Keep the union for now to minimize diff: set `assessmentType` only to `"exam"` and leave the dead `quiz` branches untouched — they are unreachable, follow-up cleanup.
- `initialMode` simplifies to `searchParams.get("mode") === "exam" ? "exam" : "learning"`.
- The chat page no longer reads `?mode=quiz` or `?day=`. Direct links into the old URL still land safely on chat in learning mode.

### 4. `AssessmentView` — no changes required
It already accepts `type="quiz"` with `day`, renders intro / active / review phases internally, and calls `onSubmit` / `onEnd`. The dialog reuses it as-is.

## Behaviour after change
- Student opens **Lesson Plan** on home, expands a week, clicks **Take Quiz** → modal opens in place, intro phase shown.
- Quiz runs inside the modal; timer, answers, review, "Study weak topics" are all in the dialog. "Study weak topics" simply closes the dialog and navigates to `/student/chat?topics=...` (same handler shape as today, optional — can be deferred).
- On submit: results saved, mastery updated, review shown inside the dialog. Closing returns the student to the lesson plan on home (no navigation away).
- AI Chat page never auto-launches a quiz and no longer shows the weekly-quiz pop-up on entry.

## Out of scope
- Re-styling `AssessmentView`.
- Showing per-week quiz completion state on the lesson plan card (would be a nice follow-up).
- Cleaning the now-dead `"quiz"` branches inside `AIChat.handleAssessmentSubmit` and `assessmentType` union.

## Open question
"Pop up window" — I'm reading this as an in-page modal dialog (no navigation, no new browser window). Confirm if you actually want a separate browser `window.open(...)` popup instead; that path is doable but loses shared React state and the `supabase` client session has to be re-bootstrapped in the new window, which I'd avoid unless you specifically need it.
