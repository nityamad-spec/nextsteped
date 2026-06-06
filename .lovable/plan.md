# Weekly Quiz generation progress bar

Mirror the live progress UI used in `DiagnosticQuestionsSetup` so that, while a week's quiz is generating, the teacher sees an overall progress bar, elapsed/ETA timer, and per-tier (Standard / Easy / Medium / Hard) progress cards — instead of just a spinning button.

## UX

When the user clicks **Generate Weekly Quiz** on a given week in `/teacher/setup/lesson-plan`:

- The button stays in its loading state.
- Directly below the button, a bordered panel appears showing:
  - Header row: spinner + "Generating Week N quiz…" on the left, "Xs elapsed · ~Ys remaining" on the right.
  - One overall horizontal progress bar.
  - A 2-column grid of 4 small tier cards (Standard, Easy, Medium, Hard), each with its own mini progress bar and a status label that ramps through "Generating questions…" → "Validating MCQs…" → "Finalizing…".
- Panel disappears as soon as generation finishes (success or failure); existing toasts are unchanged.
- Only the week currently generating shows the panel; other weeks are unaffected.

## Technical notes

File: `src/pages/teacher/CourseCreation.tsx`

1. Add an `elapsed` state and a `useEffect` ticking every 250ms while `generatingQuizWeek !== null` (reset to 0 when it returns to null). Same pattern as `DiagnosticQuestionsSetup.tsx` lines 57–69.
2. Add module-level constants:
   - `QUIZ_TIERS = ["Standard","Easy","Medium","Hard"]`
   - `QUIZ_ESTIMATED_SECONDS = 35` (single week, 4 tiers in parallel — faster than diagnostic's 75s).
3. Reuse the same `tierStatus(idx)` and `overallPct` / `etaSeconds` math from the diagnostic component, scaled to `QUIZ_ESTIMATED_SECONDS`.
4. In the Weekly Quiz section JSX (around lines 1687–1718), render the progress panel right after the action-button row, gated by `generatingQuizWeek === w.week`. Use the existing `Progress` component from `@/components/ui/progress` and `Loader2` / `Clock` icons from `lucide-react` (Clock is not yet imported here — add it).
5. No backend, edge-function, or DB changes. Progress is purely a client-side simulation, identical to the diagnostic flow.
