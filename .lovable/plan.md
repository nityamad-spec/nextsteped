Implement a focused fix for `/student/chat?mode=exam` so unfinished Exam Prep attempts cannot be resumed after a browser tab close or refresh.

1. **Stop auto-resuming Exam Prep on page load**
   - Remove the mount-time auto-start behavior that calls `handleStartExam()` whenever the URL has `mode=exam`.
   - This prevents a refresh from reconstructing an active exam with the same questions and letting the student continue.

2. **Keep only completed attempts persistent**
   - Leave completed exam submissions unchanged: results will still save after the student submits/finishes.
   - Do not persist mid-exam answers, current question position, timer, or skipped-question state.

3. **Discard all mid-exam state when leaving**
   - When the student confirms navigation away, switch modes, cancels, refreshes, or closes the browser tab, the active assessment component unmounts and its local state is lost.
   - This includes answered questions, skipped questions, current question index, and remaining time.

4. **Preserve the normal Exam Prep entry flow**
   - Opening Exam Prep will show the setup panel/welcome state.
   - The student must explicitly click **Start Exam** again to begin a fresh attempt.

**Technical details**
- Main change: `src/pages/student/AIChat.tsx`.
- Remove the `useEffect` that runs once on mount and calls `handleStartExam()` for `?mode=exam`.
- No database migration is needed because unfinished progress is currently component state, not a backend record.
- `AssessmentView` already keeps answers/skipped position/timer in local React state, so unmounting it discards progress by design.