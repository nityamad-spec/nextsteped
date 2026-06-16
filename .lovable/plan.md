Implement a focused anti-resume guard for Exam Prep assessments.

1. **Detect browser-tab cheating events only during an active exam**
   - Add listeners for `document.visibilitychange`, `window.blur`, and `pagehide` while the Exam Prep assessment phase is active.
   - Do not rely on `beforeunload` alone, because it only warns on refresh/close and does not fire for normal browser tab switching.

2. **Immediately discard the in-progress attempt**
   - When the browser tab becomes hidden or loses focus, clear the active assessment state, questions, metadata, timer settings, and current assessment session id.
   - Do not submit answers and do not save a result.
   - Returning to `/student/chat?mode=exam` will show the Exam Prep start panel, not the partially answered exam.

3. **Keep existing in-app navigation behavior**
   - Leave the current Home/Feedback app-tab warning dialog intact.
   - Confirming “Leave & End” will still discard progress and navigate as it does now.

4. **Avoid false triggers before the actual exam begins**
   - Wire the browser-tab guard from `AssessmentView` so it only activates after the student clicks the inner “Start Exam” button and the assessment phase is `active`, not on the intro/setup screen.

5. **Update the student-facing warning text**
   - Adjust the Exam Prep warning copy to explicitly mention switching browser tabs/windows will end and discard the attempt.