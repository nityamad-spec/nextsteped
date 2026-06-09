# Fix: "Practice These in Study Mode" button does nothing on arrival

## Problem
`ExamHistory.tsx` (line 213-216) navigates to:
`/student/chat?newchat=true&topics=<weak topics>`

But `src/pages/student/AIChat.tsx` (lines 353-363) only reads `newchat` and `mode`. It never reads `topics`, so the input box stays empty and the user lands on a generic new study session with no context.

## Fix
Update the `?newchat=true` effect in `AIChat.tsx` to:

1. Read `topics` from `searchParams`.
2. Force `targetMode = "learning"` when `topics` is present (study mode is the only place this makes sense).
3. After `createSession(...)` resolves, set the composer input to a prefilled prompt, e.g.:
   `Help me focus on these topics: <topics>. Start with the one I'm weakest on and explain with examples and quick practice questions.`
   (mirrors the existing `handleStudyWeakTopics` phrasing for consistency.)
4. Clear the consumed query params (`navigate(location.pathname, { replace: true })`) so a refresh doesn't re-trigger a new session.

No changes to `ExamHistory.tsx` — it already passes the right URL.

## Files
- `src/pages/student/AIChat.tsx` — extend the existing `useEffect` at lines 353-363.
