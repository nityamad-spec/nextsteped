## Goal
On `/teacher/setup/exam-mode`, when a teacher opens **Add Question** for a Manual exam, ensure a working **Concept** dropdown is always shown so every manual question is mapped to a course concept (used to update concept mastery).

## Diagnosis
The Add Question dialog (`src/pages/teacher/ExamMode.tsx`, ~lines 896–910) already has a Concept field, but it conditionally renders:

```
{concepts.length === 0 ? <p>No concepts yet…</p> : <Select … />}
```

The user reports seeing the "Concept" label but no dropdown. Two likely causes:
1. `concepts` is empty at the moment the dialog opens because the initial fetch (in the same `useEffect` as `assessment_questions`) hasn't resolved or silently failed — there is no error toast on the concepts side of the `Promise.all`.
2. Concepts exist for the course but the user is on a course whose `concepts` rows haven't loaded yet, so the fallback text appears instead of a dropdown.

## Changes (all in `src/pages/teacher/ExamMode.tsx`)

1. **Split the concepts fetch from the questions fetch** and add error handling:
   - Move concept loading into its own `useEffect` keyed on `courseId`.
   - Log + toast on error (`"Failed to load concepts"`).
   - Expose a `refetchConcepts()` helper.

2. **Re-fetch concepts when the Add Question dialog opens** (in `openAddDialog`) so a teacher who just added concepts in another tab sees them immediately.

3. **Always render the dropdown** in the dialog:
   - Replace the `concepts.length === 0 ? <p>…</p> : <Select/>` branch with a single `<Select>` that's always rendered.
   - When `concepts.length === 0`: show a disabled trigger with placeholder "No concepts yet" plus a small helper line linking to Concept Management (`/teacher/setup/concept-review`) and a "Refresh" button that calls `refetchConcepts()`.
   - When concepts exist: render the existing list (`{concept_code} — {concept_name}`).

4. **Make Concept required and visible as required**:
   - Add a red `*` to the `Label` ("Concept *").
   - Save button stays disabled until `formTopic` is set (already enforced at line 956).
   - Add inline helper text: "Used to track concept mastery for this question."

5. **Keep the question→concept mapping intact** on save:
   - `handleSaveQuestion` already resolves `concept_id` from `formTopic` via the `concepts` table (lines 458–467) and writes both `concept_id` and `topic`. No change needed there.

## Out of scope
- No DB schema changes.
- No changes to the generated (AI) flow — only the manual Add Question dialog UI and concept loading.
- No edge function changes.

## Verification
1. Open `/teacher/setup/exam-mode`, switch a mock to **Manual**, click **Add Question** from that exam card.
2. Concept field shows a populated dropdown listing every course concept; selecting one enables Save.
3. If a course has no concepts: dropdown trigger is disabled with "No concepts yet" and a link to Concept Management; Refresh re-pulls without reloading the page.
4. After saving, the question row in the Custom Exam Questions list shows the chosen topic, and the assessment_questions row has the matching `concept_id`.
