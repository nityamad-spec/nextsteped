## Plan — Redesign Exam Prep panel to match screenshot

File: `src/components/ExamPrepPanel.tsx` only. No prop or logic changes.

### 1. Replace top info banner with a welcome hero card

Swap the small info strip for a large card:

- Left: rounded square icon tile (primary-tinted) with `ClipboardList` / `FileText` icon.
- Right: eyebrow label `EXAM PREP MODE` (uppercase, tracking, primary color), serif H2 `Welcome to Exam Prep Mode!`, and description below: `Your professor created the following practice exam(s) to simulate the real exam. There is/are N practice exam(s) you can take.` (reusing existing `examAvailabilityLine`).
- Subtle bordered card with light gradient/muted background.

### 2. Section header row

Below the hero, add:

- Left: bold `Practice exams` heading + muted subtitle `Complete professor-created simulations and review your performance after each attempt.`
- Right: existing `Performance` outline button (moved here, no other actions in this row).

Remove the standalone action bar and the disabled `Edit Settings` button entirely (settings are professor-controlled and were already disabled). The `showSettings` state and expandable settings block become dead code — delete them along with `resetToRecommended`, `handleQuestionCountChange`, unused Slider/Input/Label imports, `timeLimit`/`questionCount` state.

Since `onStart` still needs settings, pass fixed values from professor recommendation: `{ timeLimit: profTime, questionCount: profCount, difficulty: "Mixed", questionMix: "mixed" }`.

### 3. Exam card

Match screenshot layout:

- Left icon tile (same style as hero, smaller) with `FileText` icon.
- Top row of small pill badges: solid primary-tinted `Professor created` + outline `Available` (or `Completed` when done, `No questions yet` fallback).
- Bold title `exam.label`.
- Metadata row below: `Clock` `{lengthMin} minutes` · `FileText` `{questionCount} questions` · `Plus` `{attemptsRemaining} attempt{plural} available` (attempts is currently unused; if `StudentExamInfo` doesn't expose it I'll display `1 attempt available` as a static default and note it — see open question).
- Right side: primary solid `Start exam →` button (with `ChevronRight`), disabled states unchanged.

Best-score line kept but moved under metadata when present.

### 4. Empty state

Keep current empty state block, restyled to match new card treatment.

### Risks / notes

- Purely presentational. Logic, callbacks, and data shape unchanged.
- Deleting the (already-disabled) settings toggle removes UI that today does nothing — no behavior lost.

### Open question

- Attempts remaining: `StudentExamInfo` doesn't currently carry an attempts count in this component's prop usage. Options:
(a) Show static `1 attempt available` when not completed, `0 attempts available` when completed.
- &nbsp;