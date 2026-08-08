# Browser lock for weekly quizzes

Weekly quizzes launched from the Learning Path get a proctored mode: fullscreen, copy/paste blocked, and a warn-then-void rule when the student leaves the quiz window.

## Why it doesn't fire today (to confirm first)

The quiz already listens for `visibilitychange` and `pagehide`. Switching to a different browser or another app usually leaves the tab `visible` — only the window loses focus — so neither event fires. The plan's first step is to confirm this in the browser and then add focus-based detection, which covers app switching, second-browser switching, and exiting fullscreen.

## Behaviour

Start of a weekly quiz:
- A short "Proctored quiz" notice on the intro screen listing the rules.
- Starting the quiz requests fullscreen. If the student declines or the browser refuses, they see a message and can retry; the quiz does not start outside fullscreen.

During the quiz:
- Leaving counts as a violation: switching tabs, switching windows/apps, minimising, or exiting fullscreen.
- First violation: on return, a blocking warning dialog — "You left the quiz. One more and this attempt is voided." Timer keeps running. Continue re-enters fullscreen.
- Second violation: attempt is voided immediately. A "Attempt voided" screen explains why. Nothing is scored.
- Copy, cut, paste, text selection and right-click are disabled inside the quiz.
- Refresh or closing the tab triggers the browser's "leave site?" confirmation, and counts as a violation if they return.

Retakes:
- Each week allows one voided attempt. After the first void, "Take Quiz" is available again with a note that it is the final attempt.
- After a second void, the week is locked: the button reads "Locked — contact your professor", and only a professor reset reopens it.
- A submitted quiz behaves as today (one attempt, no retake).

## Technical notes

- New `useProctoring` hook (used by `AssessmentView` when `proctored` is on) owning: fullscreen request/exit tracking, `visibilitychange`, `window` blur/focus, `fullscreenchange`, `beforeunload`, and clipboard/contextmenu suppression. Violations are debounced so one switch doesn't register twice from blur + visibility.
- `AssessmentView` gains a `proctored` prop and two new phases: `warning` and `voided`. Existing exam behaviour (immediate `onEnd` on hide) is replaced by the same warn-then-void rule so both formats behave consistently.
- `WeeklyQuizDialog` passes `proctored`, records voids, and blocks close during the active phase (already partly present via the leave-confirmation dialog).
- Persistence: new table `public.weekly_quiz_attempt_voids` (`student_id`, `course_id`, `quiz_day`, `reason`, `created_at`) with RLS — students insert and read their own rows, professors read rows for their course — plus the required GRANTs. Void is written server-side-safe on the client at the moment of voiding, so closing the laptop still records it.
- `StudentLearningPath` loads void counts per week alongside `takenQuizzes` and derives three states: available, final attempt, locked.
- Fullscreen inside a Radix dialog: the dialog content element is the fullscreen target; `WeeklyQuizDialog` needs a ref passed down so the hook can call `requestFullscreen` on it.

## Risks

- Fullscreen requires a user gesture and is unavailable on some mobile browsers (notably iOS Safari). On those, the plan degrades to focus-based detection only rather than blocking the quiz.
- Focus-based detection has false positives: OS notifications, password managers, and IME popups can steal focus. The warn-then-void rule absorbs one of these, but a small number of students may still be voided unfairly — the professor reset path is the safety valve.
- Blocking copy/paste is easily bypassed (screenshots, a second device). This raises friction, it is not real proctoring.
- Voiding on a genuine crash or network drop looks the same as cheating to the system; the void record stores a reason so the professor can judge.
