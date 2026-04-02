

## Add "Exam" Resource Type to Teaching Plan

### Problem
The Resource Type dropdown in `/teacher/teaching-plan` has no "Exam" option. Teachers cannot add an exam resource that links students to the TA chat exam prep page.

### Solution
Add `"exam"` as a new resource type, following the same pattern as `"quiz"` (Daily Quiz). When a student clicks an exam resource in their lesson plan view, it navigates to `/student/chat?mode=exam-prep&type=exam`.

### Changes

**`src/pages/teacher/TeachingPlan.tsx`**

1. Extend the `Resource["type"]` union to include `"exam"`
2. Add entry to `typeLabels`: `exam: "Exam"`
3. Add entry to `typeIcons`: `exam: "📋"` (or similar)
4. Add entry to `typeColors`: `exam: "bg-red-50 text-red-700 ..."` (distinct from quiz)
5. Add to `resourceTypeOptions`: `{ value: "exam", label: "Exam" }`
6. In `handleAddResource`, add auto-fill logic for exam (like quiz): title = "Exam", action = "Take the course exam"

**`src/pages/student/StudentHome.tsx`** (or wherever students view the lesson plan)

7. When rendering a resource of type `"exam"`, make the click handler navigate to `/student/chat?mode=exam-prep&type=exam` instead of opening a URL

### Files Modified
- `src/pages/teacher/TeachingPlan.tsx` — add exam to type system and dropdown
- Student-facing lesson plan view — add exam click navigation

