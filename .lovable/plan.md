# Fix Diagnostic Quiz: Confidence Slider Blocks Next Question

## Problem

On the diagnostic quiz (`/student/diagnostic`), once a student answers a question:

- The confidence slider appears at the middle position ("Somewhat Confident").
- The text "Please select your confidence level" is shown.
- The "Next Question" button is disabled.
- Clicking the slider in place does not register a selection — the student must physically drag the slider thumb to set a value.

This is because internal state `confidence` starts as `null`. The slider is rendered with a fallback display value of `[50]`, but `onValueChange` only fires when the value actually changes. A click on the same position never updates state, so the student is stuck.

## Root Cause

In `src/pages/student/DiagnosticQuiz.tsx`:

```ts
const [confidence, setConfidence] = useState<number | null>(null);
const canProceed = hasAnswer && confidence !== null;
...
<Slider
  value={confidence !== null ? [confidence] : [50]}
  onValueChange={(val) => setConfidence(val[0])}
  ...
/>
```

The visual default (50) and the actual state (`null`) are out of sync, and the slider's discrete `step={50}` makes single-click adjustments unreliable.

## Fix

Treat the confidence slider as a real form control that defaults to a sensible value the moment it becomes visible, while still letting the student adjust it.

Changes in `src/pages/student/DiagnosticQuiz.tsx`:

1. **Auto-initialize confidence to 50** as soon as the student provides an answer (so the displayed slider position matches state). Add an effect that sets `confidence` to `50` when `hasAnswer` becomes true and `confidence` is still `null`.
2. **Remove the "Please select your confidence level" warning state** and the `opacity-40` styling, since the slider will always reflect a real value.
3. Always show the confidence label (`confidenceLabels[confidence]`) under the slider.
4. Simplify `canProceed` to `hasAnswer` (confidence is guaranteed non-null whenever the slider is visible).
5. Keep `onValueChange` so dragging still works, and keep reset to `null` on next/previous question so the auto-init effect fires again on the next answer.

This makes the slider behave like a real Likert input: a default is chosen on the student's behalf, and they can confirm or change it before clicking Next.

## Files to Edit

- `src/pages/student/DiagnosticQuiz.tsx`

## Out of Scope

- The textarea contents shown in the screenshot ("What is the purpose of a function in Python?") appear to be student-typed content, not a rendering bug. No change needed there.
- No backend / migration changes.
