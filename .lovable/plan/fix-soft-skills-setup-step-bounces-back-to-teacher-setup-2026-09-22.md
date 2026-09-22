# Fix: Soft Skills setup step bounces back to /teacher/setup

## Root cause (confirmed)

`src/pages/teacher/SoftSkillsSetup.tsx:248` redirects to `/teacher/setup` whenever `typeReady && !isEmployment`.

The race: on page load, `useTeacherCourseId()` returns `null` while it validates the course id asynchronously, and `useCourseType(null)` immediately reports `ready = true` with type "academic" (`src/hooks/useCourseType.ts:24-27`). So on the very first render the page sees "ready + not employment" and navigates away before the real course id ever arrives — even though the course ("Skill Training Test") is an employment-pathway course. The console log confirms it: `SoftSkillsSetup` renders and immediately mounts a `<Navigate>`.

The sibling page `DsaQuestionsSetup` already handles this correctly (it waits for `courseId` and shows a loading state), so the fix follows that pattern.

## Change

In `src/pages/teacher/SoftSkillsSetup.tsx` only:

1. While the course id or course type is still loading, render a loading spinner instead of deciding anything:
   - `if (!courseId || !typeReady) return <loading state>` (centered spinner, matching the style used on the DSA Questions setup page).
2. Only redirect once both are known:
   - `if (!isEmployment) return <Navigate to="/teacher/setup" replace />`

No other files change. The permission-gated `ProjectLabSetup` uses a different mechanism and is not affected; `DsaQuestionsSetup` already waits correctly.

## Verification

- Typecheck passes.
- Browser check: sign in as the teacher, open `/teacher/setup`, click Step 6 "Soft Skills" — the Soft Skills page opens and stays open for the employment-pathway course.
