# Extend proctoring to diagnostic quizzes and graded exams

Today only the weekly quiz is proctored (warn on first focus loss, void on second, one voided attempt forgiven). This extends the same rules to the diagnostic quiz and to graded course exams, leaving unstructured exam practice alone.

## Rules to apply everywhere

- Mandatory fullscreen start with a "Proctored" intro screen.
- Copy, cut, paste, right-click and text selection blocked during the attempt.
- Tab / window / app switch or exiting fullscreen: first time shows a blocking warning, second time voids the attempt.
- One voided attempt is forgiven (student may retry); a second void locks that assessment until a professor or admin resets it.
- Always on — no professor toggle.

## Scope

| Assessment | Proctored |
| --- | --- |
| Weekly quiz | Yes (already) |
| Diagnostic quiz | Yes (new) |
| Graded course exam (launched from a published exam) | Yes (new) |
| Ad-hoc exam practice in the assistant | No |

## Phase 1 — Generalise void tracking

Replace the weekly-quiz-only void table with a general one covering all three assessment types, keeping student, course, type, a reference key (week number for quizzes, exam id for exams, null for diagnostic) and reason. Existing weekly quiz void rows are migrated across so no student loses their "one forgiven attempt" state. Access rules stay the same: students read and record their own voids; professors and admins on the course can read them.

## Phase 2 — Graded exam proctoring

The shared assessment screen already supports proctoring; the exam launch path turns it on only when the attempt is tied to a published course exam. Void counts are read before launch so a second void blocks the exam with a "contact your professor" message, and voids are recorded server-side when they happen.

## Phase 3 — Diagnostic quiz proctoring

The diagnostic page has its own screen rather than the shared assessment view, so it gets the same proctoring hook wired in: fullscreen-gated start on the existing intro card, restriction handlers, warning dialog, and a voided screen with a Restart option after the first void. On the second void the diagnostic is locked and the student is told to contact their professor; the already-completed path is untouched.

## Phase 4 — Professor reset

The existing professor-side reset for locked weekly quizzes is extended so a locked diagnostic or exam can be cleared the same way, from the same place.

## Phase 5 — Tests

Unit tests for the shared proctoring behaviour on both new surfaces: warn-then-void ordering, void persistence, forgiveness of the first void, lock on the second, and that unproctored practice runs are unaffected.

## Technical notes

- `weekly_quiz_attempt_voids` becomes `assessment_attempt_voids` with `assessment_type` (`weekly_quiz` | `diagnostic` | `exam`) and a nullable `ref_key`; `quiz_day` rows backfill as `weekly_quiz`. Table grants and RLS re-declared on the new table.
- `useProctoring` is reused unchanged; `AssessmentView` already accepts `proctored` / `onVoided`, so the exam path only sets those props (gated on `currentExamId != null` in `AIChat.tsx`).
- `DiagnosticQuiz.tsx` gains the hook plus warning/voided phases in its existing `phase` state machine.
- Callers of the old table (`StudentLearningPath.tsx`, `WeeklyQuizDialog.tsx`) are updated to the new name and filter by `assessment_type`.

## Risks

- Mobile browsers fire blur on keyboard open and often refuse fullscreen; the diagnostic is an onboarding gate, so a false void there is more disruptive than in a weekly quiz. Mitigated by the forgiven first void and the existing debounce, but expect some support requests.
- Renaming the void table is a breaking change for anything reading it; all known callers are listed above and updated in the same change.
- Fullscreen requires a user gesture, so the diagnostic can no longer auto-start — students must click Start.
