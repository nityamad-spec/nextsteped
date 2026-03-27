

## Plan: Rename Course Creation Route to `/teacher/setup/lesson-plan`

### Changes in `src/App.tsx`

1. Change the `/teacher/setup/course-creation` route (or add it if missing) to `/teacher/setup/lesson-plan`, rendering `<ProtectedRoute><CourseCreation /></ProtectedRoute>`
2. Update the `/teacher/setup/syllabus` redirect target from `/teacher/setup/course-creation` to `/teacher/setup/lesson-plan`
3. Search for any other references to `/teacher/setup/course-creation` across the codebase and update them to `/teacher/setup/lesson-plan`

### Files Modified
1. `src/App.tsx` — route path + redirect target
2. Any components navigating to `/teacher/setup/course-creation` (will search)

