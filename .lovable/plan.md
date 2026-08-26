# Fix: diagnostic quiz freezes mid-test

Students report the diagnostic screen "freezing" — the question stays on screen and the Next button does nothing. Three separate causes were found in `src/pages/student/DiagnosticQuiz.tsx`, all introduced by the proctored fullscreen mode. The weekly quiz does not have them because it renders its proctoring UI differently.

## Cause 1 (main) — blocking dialogs are invisible in fullscreen

The diagnostic starts in fullscreen on the quiz container. Its "Stay on the quiz" warning dialog and the "Leave the diagnostic?" dialog are Radix alert dialogs, which render into `document.body` — outside the fullscreen element. So when a student switches windows and comes back:

- the warning dialog is mounted but not painted (nothing outside the fullscreen element is visible),
- it is still a modal, so it blocks every click and key press on the page underneath.

Result: the question is on screen, nothing responds, and the student cannot advance. The only escape is leaving fullscreen — which itself counts as a violation and voids the attempt.

The weekly quiz avoids this by drawing its warning as a plain in-page overlay inside the assessment container (`AssessmentView`).

## Cause 2 — error toasts are also invisible

The same portal problem hits toasts. On a Bloom-3+ question the reasoning box is mandatory: clicking Next with it empty aborts the advance and shows a toast the student never sees. From the student's point of view the button is dead. Same for the "missing course context" error on the final submit.

## Cause 3 — the Phase A / Phase B handover can hang

At question 10 the code sets a `Loading…` state, waits for short-answer grading, then fetches the adaptive question set. That fetch has no error handling: if it throws (network drop, session refresh, RLS error), the loading flag is never cleared and the Next button stays disabled forever. There is also no timeout on the fetch.

## Fix

1. Replace both alert dialogs in the diagnostic with in-container overlays rendered inside the fullscreen element, mirroring the weekly quiz's warning overlay — same copy, same actions (Resume quiz / Keep going / Leave anyway).
2. Render blocking feedback inline instead of relying on toasts: an inline error under the reasoning box when it is required and empty (the field already supports an error state), and an inline banner for submit failures. Toasts stay only for non-blocking, informational messages.
3. Make the branch handover fail-safe: wrap the adaptive fetch in try/catch with a timeout, always clear the loading flag in a `finally`, and on failure fall back to the existing "submit what we have" path instead of stalling. Log the failure for debugging.
4. Add a general safety valve: if the loading state has been on for more than ~15 seconds, re-enable the button and show a retry message, so no future async path can permanently trap a student.

## Technical notes

- Files touched: `src/pages/student/DiagnosticQuiz.tsx` only (plus tests). No schema or edge-function change.
- The overlays go inside the `quizContainerRef` element so they are part of the fullscreen subtree; proctoring stays paused while the warning overlay is shown, as today.
- Keeping the void/lock rules exactly as they are — only the visibility and stall bugs are fixed.

## Tests

- Warning overlay renders inside the quiz container (not a body portal) and dismisses on Resume.
- Next with an empty required reasoning box shows an inline error and does not advance.
- Adaptive fetch failure at question 10 clears the loading state and falls back to submit rather than freezing.

## Note

Students currently stuck mid-attempt will be able to finish once this ships; anyone already voided by escaping fullscreen can be cleared with the existing professor "allow retake" control on course analytics.
