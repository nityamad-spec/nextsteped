

## Plan: Fix Enrollment Code Not Displaying

### Root Cause
When the teacher creates a course during onboarding (`TeacherOnboarding.tsx`), the course is inserted into the DB and the returned `id` should be stored in `currentCourse` via `setCurrentCourse`. However, the context object either lacks the DB `id` or it's not being set properly, so the `useEffect` in both `PublishEnrollment.tsx` and `SettingsIntegrity.tsx` skips the fetch.

### Investigation Needed
I need to read `TeacherOnboarding.tsx` to see how `setCurrentCourse` is called after course creation — specifically whether the Supabase-returned `id` is included in the object.

### Likely Fix

**`src/pages/teacher/TeacherOnboarding.tsx`**: After the course insert, ensure the returned row's `id` and `enrollment_code` are included in the `setCurrentCourse(...)` call. Currently it may be setting a manually constructed object without the DB fields.

**Fallback fix for both display pages**: If `currentCourse.id` is present but `enrollment_code` wasn't fetched during onboarding, the existing `useEffect` fetch should work. The primary fix is ensuring `currentCourse.id` is set correctly from the DB insert response.

### Files to Modify
1. `src/pages/teacher/TeacherOnboarding.tsx` — include DB-returned `id` and `enrollment_code` in `setCurrentCourse`

### Steps
1. Read `TeacherOnboarding.tsx` to confirm the exact issue with `setCurrentCourse`
2. Fix the course object to include the database `id` from the insert response
3. Optionally also store `enrollment_code` in context so both pages can display it immediately without a separate fetch

