

## Plan: Multi-Select Branches & Graduation Years for Course Setup

### Problem
Teachers enter branch as free text and select a single graduation year. Students see all branches from the database and all hardcoded years, rather than only the ones the teacher specified for their course.

### Approach

**1. Database migration** — Change `courses.branch` and `courses.graduation_year` from `text` to `text[]`
```sql
ALTER TABLE public.courses
  ALTER COLUMN branch TYPE text[] USING CASE WHEN branch IS NOT NULL THEN ARRAY[branch] ELSE '{}'::text[] END,
  ALTER COLUMN branch SET DEFAULT '{}'::text[];

ALTER TABLE public.courses
  ALTER COLUMN graduation_year TYPE text[] USING CASE WHEN graduation_year IS NOT NULL THEN ARRAY[graduation_year] ELSE '{}'::text[] END,
  ALTER COLUMN graduation_year SET DEFAULT '{}'::text[];
```

**2. `src/pages/teacher/TeacherOnboarding.tsx`**
- Fetch all branches from the `branches` table on mount (no degree filter needed — show all branches)
- Replace the free-text Branch `<Input>` with a multi-select UI (checkboxes or badge-based picker, consistent with the Sections pattern)
- Replace the single Graduation Year `<Select>` with a similar multi-select
- Store selected values as `string[]` in state (`branches`, `graduationYears`)
- Update the course upsert payload to send arrays
- Update the data-fetch logic to hydrate arrays from DB

**3. `src/pages/student/StudentOnboarding.tsx`**
- After resolving the course, read `branch` (now `text[]`) and `graduation_year` (now `text[]`) from the resolved course
- Filter the Branch dropdown to only show branches whose names match the course's `branch` array
- Filter the Graduation Year dropdown to only show years in the course's `graduation_year` array
- If only one option exists for either field, auto-select it

**4. Update any other files** that read `courses.branch` or `courses.graduation_year` as a single string (e.g., `TeacherOnboarding` fetch, context types) to handle arrays.

### UI Detail
- Teacher branch picker: Dropdown with checkboxes, selected items shown as removable badges (same pattern as Sections)
- Teacher graduation year picker: Same multi-select badge pattern
- Student side: Standard single-select dropdowns, but filtered to course-specified options only

### Files Modified
- 1 database migration
- `src/pages/teacher/TeacherOnboarding.tsx`
- `src/pages/student/StudentOnboarding.tsx`

