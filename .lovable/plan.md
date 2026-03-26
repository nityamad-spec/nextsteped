

## Plan: Add `in_test` Flag to Diagnostic Questions

### Problem
All diagnostic questions in the database are currently treated as active test questions. There's no way for teachers to maintain a question bank separately from what students actually see in the diagnostic test.

### Solution
Add a boolean column `in_test` (default `false`) to the `diagnostic_questions` table. Teachers can toggle individual questions on/off for the diagnostic test. The student-facing quiz only fetches questions where `in_test = true`.

### Steps

1. **Database migration** — Add column:
   ```sql
   ALTER TABLE diagnostic_questions ADD COLUMN in_test boolean NOT NULL DEFAULT false;
   ```

2. **Update `src/pages/teacher/DiagnosticQuestionsSetup.tsx`**:
   - Add an `in_test` toggle (switch or checkbox) per question in the list view
   - Allow bulk toggling (e.g. "Add selected to test" / "Remove from test")
   - Show a visual indicator (badge or highlight) for questions marked `in_test`
   - Display a count summary: "X of Y questions in diagnostic test"
   - Wire toggle to update the database column

3. **Update `src/pages/student/DiagnosticQuiz.tsx`**:
   - Change the query to fetch only from `diagnostic_questions` where `in_test = true` instead of using `mockQuizQuestions`
   - This also replaces the current mock data dependency with real DB questions

4. **Update `supabase/functions/seed-questions/index.ts`**:
   - Include `in_test: false` in seeded rows (matches default, but explicit)

### Files Modified
1. New migration SQL
2. `src/pages/teacher/DiagnosticQuestionsSetup.tsx`
3. `src/pages/student/DiagnosticQuiz.tsx`
4. `supabase/functions/seed-questions/index.ts`

