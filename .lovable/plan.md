

## Plan: Rename `item_id` → `item_code` in diagnostic_questions

### Summary
Rename the column `item_id` to `item_code` in the `diagnostic_questions` table and update the one file that references it.

### Steps

1. **Database migration** — `ALTER TABLE diagnostic_questions RENAME COLUMN item_id TO item_code;`

2. **Update `src/pages/teacher/DiagnosticQuestionsSetup.tsx`** — replace all `item_id` references with `item_code` (3 occurrences: two reads and one write).

3. **`src/integrations/supabase/types.ts`** — auto-regenerated after migration, no manual edit needed.

### Files Modified
1. New migration SQL
2. `src/pages/teacher/DiagnosticQuestionsSetup.tsx`

