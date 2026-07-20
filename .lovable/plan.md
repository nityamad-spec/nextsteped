# Plan: Rename Daily Quiz → Weekly Quiz in quiz UI

## Goal
Update all student-facing quiz labels from "Daily Quiz — Day X" to "Weekly Quiz — Week X" so the UI matches the weekly-quiz feature naming on `/student/home` and `/student/chat`.

## Scope
User confirmed this should apply **everywhere** the shared quiz UI appears (both `/student/home` weekly quiz and `/student/chat` quiz flow). Internal database values (e.g. `assessment_results.mode = 'daily_quiz'`) stay unchanged.

## Changes

### 1. `src/components/AssessmentView.tsx`
Update the three visible quiz labels and the topic cover line:
- Intro card title: `Daily Quiz — Day ${day || 1}` → `Weekly Quiz — Week ${day || 1}`
- Intro card subtitle: `Covers Day {day} topics` → `Covers Week {day} topics`
- Review screen title: `Daily Quiz Complete!` → `Weekly Quiz Complete!`
- Active assessment badge: `Daily Quiz — Day ${day}` → `Weekly Quiz — Week ${day}`

### 2. `src/pages/student/AIChat.tsx`
Keep the chat-side quiz flow consistent:
- Result summary header: `✅ **Daily Quiz Complete!**` → `✅ **Weekly Quiz Complete!**`
- Leave-dialog title: `End {… "Daily Quiz"}?` → `End {… "Weekly Quiz"}?`
- Normalize regex: `Choose **Start Exam** or **Start Daily Quiz** …` → `Choose **Start Exam** or **Start Weekly Quiz** …`

### 3. `src/components/WeeklyQuizDialog.test.tsx`
Update test expectations:
- `/Daily Quiz — Day 1/i` → `/Weekly Quiz — Week 1/i`
- `/Daily Quiz/i` → `/Weekly Quiz/i`

### 4. Optional consistency: `src/pages/teacher/AssessmentAnalytics.tsx`
- Teacher filter label `Daily Quizzes` → `Weekly Quizzes` (keeps `value="daily_quiz"` unchanged).

## Verification
- Run the affected unit tests (`WeeklyQuizDialog.test.tsx`).
- Smoke-test opening a weekly quiz from `/student/home` and a quiz from `/student/chat` to confirm labels read "Weekly Quiz — Week X".

## Notes
- No database or backend changes.
- No changes to `mode` enum values, edge functions, or analytics aggregation logic.
