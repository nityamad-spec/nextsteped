## Goal
On the student diagnostic quiz, remove the auto-default of "Somewhat Confident" for each question's confidence selector. Force the student to manually pick a confidence level before they can advance.

## Changes

**File: `src/pages/student/DiagnosticQuiz.tsx`**

1. **Remove the auto-default effect** (lines 295–299). The `useEffect` that sets `confidence` to `1` once `hasAnswer` becomes true is what creates the "Somewhat Confident" default. Delete it entirely.

2. **Block Next until confidence is chosen** — update `canProceed` (line 291):
   - From: `const canProceed = hasAnswer;`
   - To: `const canProceed = hasAnswer && confidence !== null;`
   This keeps the existing answer requirement and adds an explicit confidence requirement. The Next/Finish button (line 688) already uses `canProceed`, so it will disable automatically.

3. **Render the slider in an unselected state** (lines 663–680):
   - Change `value={[confidence ?? 1]}` → omit `value` and use `defaultValue={undefined}` with a controlled pattern that only passes `value` when `confidence !== null`. Concretely: when `confidence === null`, render the slider with no thumb highlighted by using `value={undefined}` (uncontrolled) and an `onValueChange` that sets the chosen value. Simpler alternative: keep it controlled but render the slider only after confidence !== null, and show three clickable pill buttons (Not / Somewhat / Very Confident) before any selection. Pick the radio/pill approach for clarity since shadcn Slider always renders a thumb.
   - Replace the Slider block with a 3-button segmented selector: three buttons "Not Confident", "Somewhat Confident", "Very Confident" laid out horizontally. The selected one uses `variant="default"`, unselected use `variant="outline"`. Clicking sets `confidence` to 0/1/2.
   - Remove the "current label" line (lines 678–680) since the selected button already shows the choice.
   - Add a small helper text above the buttons: "Select your confidence level to continue." shown only when `confidence === null`.

4. **Back-navigation** (line 685) — already restores `prevConfidence ?? null`, so no change needed. When navigating back to a previously-answered question, the student's prior confidence stays selected.

5. **Resume from localStorage** — `setConfidence(typeof saved.confidence === "number" ? saved.confidence : null)` (lines 229, 270) is already correct; if the saved confidence was null, the student will see the question with no selection and must re-pick before advancing.

## Out of scope
- No changes to `score-diagnostic` edge function. It already accepts confidence 0–2 and falls back to `CONFIDENCE_DEFAULT = 1` when a value is missing, but with this change every submitted question will have an explicit confidence value, so the fallback won't trigger.
- No changes to weekly quiz / exam flows — confidence collection there was already removed.
- No DB or schema changes.

## Verification
- Open `/student/diagnostic-quiz` (or resume an existing in-progress run): after answering a question, the Next button should stay disabled until one of the three confidence buttons is clicked.
- Refresh mid-question: the chosen answer and (if previously selected) confidence should restore; otherwise no confidence is pre-selected.
- Back to a previous question: the previously chosen confidence reappears as selected.
