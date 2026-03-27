

## Plan: Redirect `/teacher/setup/syllabus` to Lesson Plan Page

### Change
In `src/App.tsx`, replace the `/teacher/setup/syllabus` route's element from `<CourseCreation />` to a `<Navigate to="/teacher/setup/course-creation" replace />` (or whichever is the lesson plan page).

Let me verify the correct target path first.

Based on the setup flow memory and routes in `App.tsx`:
- `/teacher/setup/syllabus` currently renders `<CourseCreation />`
- The route `/teacher/setup/course-creation` was just added to also render `<CourseCreation />`

Since the user wants `/teacher/setup/syllabus` to redirect to the lesson plan page, and the teaching plan route is `/teacher/teaching-plan` (dashboard) while the setup flow doesn't have a dedicated "lesson plan" step URL visible in the routes, the most likely intent is to redirect to `/teacher/setup/course-creation`.

### Fix
In `src/App.tsx`, change the `/teacher/setup/syllabus` route to redirect:

```tsx
<Route path="/teacher/setup/syllabus" element={<Navigate to="/teacher/setup/course-creation" replace />} />
```

### Files Modified
1. `src/App.tsx` — replace syllabus route with redirect

