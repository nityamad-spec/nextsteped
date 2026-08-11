# Practice prompt: request 10 questions by default

When a student clicks "Start practice" on the learning path, the Practice Questions box is pre-filled from the `?practice=1&topic=...` deep link. Today it reads "Give me practice questions on X." — it will instead ask for 10 questions.

## Change

`src/pages/student/AIChat.tsx`, deep-link handler (~line 448):

- New pre-filled text: `Generate 10 practice questions on {topic}.`

The prompt stays editable, so a student can change the count or topic before generating. No backend, schema, or generation-logic changes.
