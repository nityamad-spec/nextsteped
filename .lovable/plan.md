

## Plan: Add `course_code` Column to Courses Table

### Summary
Add a unique `course_code` text column to the `courses` table via a database migration.

### Database Migration

```sql
ALTER TABLE public.courses
  ADD COLUMN course_code text UNIQUE;
```

- Nullable by default so existing rows are unaffected
- `UNIQUE` constraint ensures no two courses share the same code

### Files Modified
1. New database migration — add `course_code` column to `courses`

