

## Plan: Improve Course Auto-Population with Specific Course ID

### Problem
The current `useEffect` always fetches the *most recent* course by `teacher_id`. If a teacher navigates back to this page after creating a course, it should prioritize the `currentCourseId` stored in localStorage to load the correct course. Additionally, the `localStorage` courseId should be set immediately after fetching so downstream pages have it available.

### Current State
The page already auto-populates all fields from the database (lines 35–62). The fetch logic queries `profiles` and `courses` tables and populates `name`, `department`, `graduation_year`, `branch`, `term`, `sections`, `objectives`, `course_code`, and `courseName`.

### Changes

**File: `src/pages/teacher/TeacherOnboarding.tsx`**

1. **Use `currentCourseId` from localStorage when available** — modify the course fetch query to first check `localStorage.getItem("currentCourseId")` and use `.eq("id", storedCourseId)` if present, falling back to the existing `teacher_id` + latest ordering query
2. **Set `currentCourseId` in localStorage on fetch** — when a course is found during load, immediately store its `id` in localStorage so downstream pages have the right context
3. **No UI changes needed** — the form fields and their bindings are already correct

### Technical Details
```typescript
// Updated fetch logic
const storedCourseId = localStorage.getItem("currentCourseId");
let courseQuery = supabase.from("courses")
  .select("id, branch, term, sections, objectives, course_code, name");

if (storedCourseId) {
  courseQuery = courseQuery.eq("id", storedCourseId);
} else {
  courseQuery = courseQuery.eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
}

// After fetch, store courseId
if (courseRes.data) {
  localStorage.setItem("currentCourseId", courseRes.data.id);
  // ... populate fields
}
```

### Files Modified
1. `src/pages/teacher/TeacherOnboarding.tsx` — improve course fetch to use stored courseId, set courseId on load

