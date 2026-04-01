

## Fix: Daily Quiz Not Starting from Student Home Link

### Problem
When a student clicks "Daily Quiz" on `/student/home`, they navigate to `/student/chat?mode=quiz&day=1`. However, the auto-start logic on line 93 of `AIChat.tsx` checks `taSettings.quizDaysEnabled.includes(day)` before starting the quiz. If `quizDaysEnabled` is empty or doesn't include the day, the quiz silently fails to start, and the student lands on the chat page showing the "Start Exam" button instead.

### Solution
Remove the `quizDaysEnabled` gate from the URL-triggered auto-start. If the student was sent here from the teaching plan with `mode=quiz`, the teacher has already unlocked that day — the quiz should start regardless. The `quizDaysEnabled` check should only gate the buttons shown inside the chat UI, not the URL-based entry point.

### Changes

**`src/pages/student/AIChat.tsx` (line 92-93)**

Before:
```typescript
if (urlMode === "quiz") {
  if ((taSettings.quizDaysEnabled || []).includes(urlDay)) handleStartQuiz(urlDay);
}
```

After:
```typescript
if (urlMode === "quiz") {
  handleStartQuiz(urlDay);
}
```

This ensures clicking "Daily Quiz" from student home always opens the quiz intro screen ("Daily Quiz — Day 1" with "Start Quiz" button) shown in the screenshot, rather than falling through to the exam prep view.

### Files Modified
- `src/pages/student/AIChat.tsx` — remove `quizDaysEnabled` gate from URL-triggered quiz start

