

## Plan: Auto-populate Teacher Onboarding Fields from Database

### Overview
Add a `useEffect` that fetches existing profile, course, and file data on mount and pre-fills all form fields. Show a loading state while fetching.

### Changes

**File: `src/pages/teacher/TeacherOnboarding.tsx`**

1. **Add `useEffect` + `loading` state** — on mount (when `user` is available), run three parallel queries:
   - `profiles` → `name`, `department` where `id = user.id`
   - `courses` → `branch`, `term`, `sections`, `objectives` where `teacher_id = user.id` (use `.maybeSingle()` to get latest)
   - `course_material_files` → `file_name`, `file_size`, `storage_path`, `folder_type` where `teacher_id = user.id`

2. **Pre-fill state** from results:
   - `name`, `department` from profile
   - `branch`, `term`, `sections`, `objectives` (joined with newlines), `studentYear` from course (note: `graduation_year` is on profiles table, not courses — fetch from profile if available)
   - Split files by `folder_type` into `syllabusFiles`, `materialsFiles`, `lessonPlanFiles` (mapped to `{ name: file_name, size: file_size, path: storage_path }`)

3. **Loading guard** — while fetching, show a centered spinner/skeleton instead of the form. Set `loading = false` after queries complete.

4. **Add `import { useEffect }` to the imports** (currently only `useState` is imported).

### Files Modified
- `src/pages/teacher/TeacherOnboarding.tsx`

