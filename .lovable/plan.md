## Why

Goskula Rithika has no `diagnostic_results` row for her enrolled course (Intro to Generative AI) even though she has 15 assessment attempts, 15 concept-mastery rows, and 3 chat sessions. The course has 40 diagnostic questions ready and `score-diagnostic` never errored for her — she simply skipped the diagnostic. Today it's only a soft nudge on `StudentHome`; nothing prevents jumping straight into chat, weekly quizzes, practice, or exams. That's why `/admin/students` correctly shows "no diagnostic" for real users.

## What to change

Make the diagnostic a **hard gate for anything performance-scored** (weekly quizzes, practice questions, exam mode), while leaving Home and free-form Chat browsable so students still see the nudge and can orient themselves. Also backfill visibility for admins so this is easier to spot.

### 1. New shared hook `useDiagnosticStatus(courseId)`
- Location: `src/hooks/useDiagnosticStatus.ts`.
- Queries `diagnostic_results` for `(student_id, course_id)`; returns `{ loading, taken, resultId }`.
- Reused by `StudentHome`, the new guard, and any page that wants to check.

### 2. New route guard `RequireDiagnostic`
- Location: `src/components/student/RequireDiagnostic.tsx`.
- Reads active/enrolled course via existing `useEnrolledCourseId`.
- If `taken === false`: render a full-page card explaining "Please complete the diagnostic first" with a primary CTA button that navigates to `/student/diagnostic?course=<id>`. No auto-redirect (avoids loops if a student is mid-diagnostic on another tab).
- If `loading`: render existing skeleton.
- If `taken`: render `<Outlet />`.

### 3. Wrap gated student routes in `src/App.tsx`
Apply `RequireDiagnostic` to:
- `/student/chat` **only for Exam Prep + Weekly Quiz sub-modes** (Study mode stays open — see §4).
- `/student/practice` (if present in router).
- Any `/student/exam*` route.

Leave `/student/home`, `/student/feedback`, `/student/onboarding`, `/student/diagnostic` **ungated**.

### 4. In `src/pages/student/AIChat.tsx`
- On mount, if `taken === false` and the user tries to switch to *Exam Prep* or open a *Weekly Quiz*, show a blocking dialog with the same CTA. Study mode remains available so students can still learn.

### 5. Fix the silent-exit in `src/pages/student/DiagnosticQuiz.tsx`
- Current "back" from question 0 dumps the student on `/student/onboarding` and clears `localStorage`. Change: require a confirmation dialog ("Leave without saving? Your progress will be lost and you'll be asked again."). Keep localStorage intact if they cancel.

### 6. Admin visibility tweak in `src/components/admin/StudentProfileDialog.tsx`
- When `Diagnostic:` is missing, render an amber `Diagnostic pending` badge (instead of the plain "no diagnostic" muted text) so it stands out during audits. No schema change.

### 7. Backfill / follow-up for Rithika
- No auto-backfill (we don't have her real diagnostic answers). The next time she visits Chat / Weekly Quiz / Exam, the new gate will route her into the diagnostic. Admin dialog now flags her clearly.

## Not doing
- No DB schema change, no new edge function, no changes to `score-diagnostic`.
- No changes to teacher/admin flows beyond the badge.
- Not gating Home or Study-mode chat (students still need a landing surface).

## Verification
- Log in as a student with no `diagnostic_results` row → confirm Home loads with nudge, `/student/chat?mode=exam` and weekly quiz open the block dialog, `/student/practice` shows the guard card.
- Submit the diagnostic → confirm all previously-gated surfaces unlock without refresh (hook re-fetches on route change).
- `/admin/students` → Rithika now shows the amber "Diagnostic pending" badge.
