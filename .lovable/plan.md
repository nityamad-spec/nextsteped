## Goal
On `/teacher/setup/exam-mode`, restrict question types to **MCQ** and **True/False** only — both for the "Question types to include" selector and for the custom-question filter/dropdown. Leave `Assessments.tsx` untouched.

## Changes

1. **`src/components/QuestionTypeSelector.tsx`**
   - Add optional `allowedTypes?: string[]` prop. When provided, filter `ALL_TYPES` to those keys before rendering. Default behavior (all four) is preserved so `Assessments.tsx` is unaffected.

2. **`src/pages/teacher/ExamMode.tsx`**
   - Pass `allowedTypes={["mcq", "true_false"]}` to `<QuestionTypeSelector>` (line ~325).
   - In the filter chip row (line ~446), drop `"Short Answer"` and `"Code Practice"` so only MCQ and True/False chips render.
   - In the add-question dialog's type `<Select>` (line ~546 area), remove the `"Short Answer"` and `"Code Practice"` `<SelectItem>`s.
   - Update the `parseMixToTypes` default-fallback (line 49) so `"mixed"` expands to `["mcq", "true_false"]` only (otherwise stored "mixed" still shows excluded types as selected under the hood).
   - Sanitize any incoming saved value that contains `short_answer` / `problem_solving` by stripping those keys when initializing/saving `examQuestionTypes`, so previously-saved settings don't reintroduce them.

3. No DB / type changes — the `TASettings.examQuestionMix` field remains a comma-separated string; we just constrain what this page writes.

## Out of scope
- `Assessments.tsx` selector, weekly quiz settings, and any backend generation logic remain unchanged.
