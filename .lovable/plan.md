

## Fix: Auto-Load Teacher's Course on Assessment Analytics

### Problem
When `currentCourse` is `null` in the app context (e.g., after localStorage clears or direct navigation), the Assessment Analytics page shows "No course selected" instead of loading the teacher's course.

### Solution
Add an auto-recovery effect in `AssessmentAnalytics.tsx` that fetches the teacher's course from the database when `currentCourse` is null, and sets it in the app context. This mirrors the pattern used in `TeacherOnboarding.tsx`.

### Changes

**`src/pages/teacher/AssessmentAnalytics.tsx`**

Add a `useEffect` at the top of the component that runs when `currentCourse` is null:

1. Import `useAuth` and `setCurrentCourse` from contexts
2. Query `courses` table for the teacher's course (`teacher_id = user.id`), falling back to `course_teachers` membership
3. Call `setCurrentCourse()` with the fetched course data

```typescript
const { currentCourse, setCurrentCourse } = useApp();
const { user } = useAuth();

useEffect(() => {
  if (currentCourse || !user) return;
  
  const recover = async () => {
    // Try owned course first
    let { data } = await supabase
      .from("courses")
      .select("id, name, course_code")
      .eq("teacher_id", user.id)
      .limit(1)
      .maybeSingle();
    
    // Fallback: collaborator membership
    if (!data) {
      const { data: membership } = await supabase
        .from("course_teachers")
        .select("course_id")
        .eq("teacher_id", user.id)
        .limit(1)
        .maybeSingle();
      if (membership?.course_id) {
        const res = await supabase
          .from("courses")
          .select("id, name, course_code")
          .eq("id", membership.course_id)
          .maybeSingle();
        data = res.data;
      }
    }
    
    if (data) {
      setCurrentCourse({ id: data.id, name: data.name } as Course);
    }
  };
  recover();
}, [currentCourse, user]);
```

This ensures the PWIM course (or whichever course the teacher owns) loads automatically instead of showing "No course selected."

### Files Modified
- `src/pages/teacher/AssessmentAnalytics.tsx` — add course auto-recovery when `currentCourse` is null

