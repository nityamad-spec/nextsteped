## Diagnosis
The "Failed to load concepts" toast comes from `refetchConcepts()` in `src/pages/teacher/ExamMode.tsx`, which runs:

```ts
supabase.from("concepts").select("id, concept_code, concept_name")
```

But the `concepts` table has **no `concept_name` column**. Actual columns: `id, course_id, concept_code, weight, created_at`. PostgREST returns an error → toast fires → `concepts` stays empty → no dropdown.

The display name for a concept lives on the lesson plan (and on `assessment_questions.topic`), not on the concepts table. `concept_code` is the human-readable label used everywhere else (e.g. "Generative AI Foundations and Prompting" stored as the code).

The same bug exists in `src/pages/teacher/Assessments.tsx`, but it's been silently masked because that page never shows an error toast on its concepts fetch.

## Fix (all in `src/pages/teacher/ExamMode.tsx`)
1. Change the concepts query to:
   ```ts
   .select("id, concept_code")
   ```
2. Update the `concepts` state type to `{ id: string; concept_code: string }[]`.
3. Update the dropdown item to show just `{c.concept_code}` (drop the ` — {c.concept_name}` half).

## Also fix `src/pages/teacher/Assessments.tsx` (same bug)
1. Same three changes: drop `concept_name` from the `select`, from the state type, and from the `SelectItem` label.

## Out of scope
- No schema change. `concept_code` already holds the readable name in this project; introducing a separate `concept_name` column would touch onboarding, lesson-plan sync, mastery analytics, and every other concept reference — not needed to fix this bug.
- No RLS / GRANT changes.

## Verification
1. Reload `/teacher/setup/exam-mode` → no "Failed to load concepts" toast.
2. Switch a mock to Manual → Add Question → Concept dropdown is populated with the course's concept codes and is selectable.
3. Save a question → row appears tagged with the chosen concept; mastery linkage (`assessment_questions.concept_id`) is set correctly.
4. `/teacher/assessments` concept filter dropdown still shows the same list without errors.
