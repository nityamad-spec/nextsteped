## Changes to `src/pages/student/Feedback.tsx`

1. **Remove the "Quick Feedback Survey" section** — delete the entire card containing the 7-question survey (NumberScale/ChipSelect fields, submit button, and associated state: `answers`, `submitting`, `submitted` survey-completion branch). Keep the open-ended "Share Feedback Anytime" submission intact.

2. **Add a new section at the top**, above "Share Feedback Anytime":
   - Card titled e.g. "Course Survey"
   - Short description prompting students to complete the linked Google Form
   - Button/link opening a placeholder Google Forms URL (`https://forms.gle/PLACEHOLDER`) in a new tab

3. **Cleanup** — remove now-unused `NumberScale` and `ChipSelect` helpers and unused imports.

No backend/schema changes. Pure presentation.