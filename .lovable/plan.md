## Goal
On `/student/onboarding`, when submission fails because the email isn't on the course roster, show a visible inline message in the form instead of only a transient toast.

## Changes
**`src/pages/student/StudentOnboarding.tsx`**
- Add a `submitError: string | null` state.
- In `handleSubmit`'s catch block, set `submitError` to the error message (keeping the toast as well, or replacing it — see Question below).
- Clear `submitError` when the user edits `email` or `enrollmentCode`.
- Render a shadcn `Alert` (variant `destructive`) above the Back/Submit buttons when `submitError` is set. The message text comes straight from the edge function, which already returns the exact copy: "Your email isn't on this course's approved roster. Please contact your instructor."

No backend changes — the `student-pending-signup` function already returns that exact message.

## Question
Should the toast still fire alongside the inline alert, or should the inline alert fully replace the toast for submission errors? (Default: keep both — inline alert for visibility, toast for immediate feedback.)
