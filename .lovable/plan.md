

## Fix: Daily Quiz Questions Not Displaying on Assessments Page

### Root Cause

`Assessments.tsx` reads the course ID from `localStorage.getItem("currentCourseId")` (line 37), but when the course is loaded via the auto-recovery logic in `AppContext` (persisted under key `ns_current_course`), the `currentCourseId` localStorage key is never set. This means `courseId` is `null`, so the query `supabase.from("assessment_questions").eq("course_id", null)` returns zero rows — even though 10 questions exist for Day 1.

The database confirms 10 daily quiz questions exist for course `cc551ce8-...` with `quiz_day = 1`.

### Solution

Replace the raw `localStorage.getItem("currentCourseId")` with `useApp().currentCourse?.id`, falling back to localStorage for backward compatibility. Add the same auto-recovery `useEffect` pattern used in other pages.

### Changes

**`src/pages/teacher/Assessments.tsx`**

1. Import `useApp` from `@/contexts/AppContext`
2. Replace line 37:
   ```typescript
   // Before
   const courseId = localStorage.getItem("currentCourseId");
   
   // After
   const { currentCourse, setCurrentCourse } = useApp();
   const courseId = currentCourse?.id || localStorage.getItem("currentCourseId");
   ```
3. Add auto-recovery `useEffect` (same pattern as AssessmentAnalytics) — if `currentCourse` is null, fetch the teacher's course from DB and set it in context + localStorage
4. Add `courseId` as a dependency check so the question fetch re-runs once the course is recovered

This single change ensures the 10 Day 1 questions are loaded and displayed correctly.

### Files Modified
- `src/pages/teacher/Assessments.tsx` — use `currentCourse?.id` from AppContext with localStorage fallback and auto-recovery

