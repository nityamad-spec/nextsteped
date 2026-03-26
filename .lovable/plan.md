

## Plan: Auto-populate Course Fields for Collaborators

### Problem
When a collaborator visits `/teacher/onboarding`, the fallback query (`courses.teacher_id = user.id`) finds nothing because they don't own the course. Only the owner's courses load. The `course_teachers` table links collaborators to courses but isn't queried.

### Solution
When no `currentCourseId` is in localStorage, add a fallback that checks `course_teachers` for the user's most recent course assignment.

### Changes — `src/pages/teacher/TeacherOnboarding.tsx`

Update the `fetchExistingData` function (lines 42-51):

1. Keep the `storedCourseId` path unchanged (works for both owners and collaborators)
2. When no stored ID exists, first try `courses.teacher_id = user.id` (owner lookup)
3. If that returns nothing, query `course_teachers` for the user's latest course assignment, then fetch that course by ID

```typescript
// Pseudocode for the new fallback logic:
if (storedCourseId) {
  // fetch by ID (existing — works for both roles)
} else {
  // Try owned course first
  const owned = await supabase.from("courses")
    .select("id, branch, term, sections, objectives, course_code, name")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!owned.data) {
    // Fallback: find course via course_teachers
    const membership = await supabase.from("course_teachers")
      .select("course_id")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membership.data) {
      // fetch course by membership.data.course_id
    }
  }
}
```

### Files Modified
1. `src/pages/teacher/TeacherOnboarding.tsx` — add collaborator course lookup fallback

