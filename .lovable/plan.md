

## Plan: Student View Should Read Teacher's Published Plan (Including Lock State)

### Problem
The student's `StudentHome` imports the workshop plan from the **static** `workshopPlan` data file. When the teacher locks/unlocks days on `/teacher/teaching-plan` and saves, that data goes to Supabase storage (`{teacherId}/lesson-plan/published-plan.json`), but the student never reads it. So lock changes are invisible to students.

### Approach

**`src/pages/student/StudentHome.tsx`**
1. On mount, resolve the student's enrolled course → get the course's `teacher_id`
2. Download the teacher's published plan from storage: `{teacherId}/lesson-plan/published-plan.json`
3. If found, use it as the workshop plan (with lock states from the teacher)
4. If not found, fall back to the static `workshopPlan` default
5. Show a loading skeleton while fetching

This mirrors the same load pattern already used in `TeachingPlan.tsx`. The storage bucket `course-materials` already has appropriate access — we may need to add a SELECT storage policy for authenticated users to read the teacher's plan file path, or use a signed URL approach.

### Storage Access
The `course-materials` bucket is private. Students currently can't read from it. We'll need to either:
- Add a storage policy allowing authenticated users to read from `*/lesson-plan/*` paths, OR
- Create a small edge function that returns the plan JSON for enrolled students

The simplest approach: add a storage SELECT policy scoped to the `lesson-plan` folder so enrolled students can download the published plan.

### Files Modified
- `src/pages/student/StudentHome.tsx` — fetch published plan from storage instead of static import
- Storage policy (via migration or Supabase config) — allow students to read lesson plan files

