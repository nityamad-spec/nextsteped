

## Plan: Add Section Field to Student Profile Setup

### Problem
Students currently don't specify which section they belong to during onboarding. Since courses support multiple sections, this data is needed for teachers to filter by section on the Course Dashboard.

### Approach
Add a dropdown to the student onboarding form that shows the sections defined on the resolved course. Store the selected section on the `enrollments` table (since section is course-specific, not student-global).

### Changes

**1. Database migration** — Add `section` column to `enrollments`
```sql
ALTER TABLE enrollments ADD COLUMN section text;
```

**2. `src/pages/student/StudentOnboarding.tsx`**
- Add `section` state variable
- After resolving the course, extract its `sections` array (already returned from the courses query — just add `sections` to the select)
- Render a Select dropdown for section (populated from `resolvedCourse.sections`), shown only when the course has sections defined
- Add `section` to the validation guard (`isValid`)
- Pass the selected section when upserting into `enrollments`

**3. `src/integrations/supabase/types.ts`** — auto-updated (no manual edit)

### UI
The section dropdown appears after the course confirmation card, before Full Name, using the same Select component style as other fields. If the course has no sections defined, the field is hidden and not required.

### Files Modified
- 1 database migration (add `section` to `enrollments`)
- `src/pages/student/StudentOnboarding.tsx`

