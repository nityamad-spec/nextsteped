

## Root Cause: Teacher Account Has No Enrollment Record

### Problem
The `/student/home` page fetches the published lesson plan by first querying the `enrollments` table for the logged-in user's `student_id`. The current session is logged in as a **teacher** (confirmed by JWT in network trace: `akash.sinha@l4g.in`, role `teacher`). Teachers have no enrollment record, so the query at line 82-87 returns `null`, causing an early return at line 89. The plan state stays at its initial value: **all days locked**.

The network trace confirms the published JSON file has `locked: false` for Day 1 — the data in storage is correct. The issue is purely that a teacher account cannot reach the download step because it fails the enrollment lookup.

### Who Is Affected
- **Teachers viewing `/student/home`** — always see all days locked (no enrollment record)
- **Actual students** — should work correctly since they have enrollment records. If students also report this, it would indicate a separate issue (e.g., enrollment missing)

### Fix — `src/pages/student/StudentHome.tsx`
Update the `fetchPublishedPlan` function to support both student and teacher users:

1. First try the student path: look up enrollment by `student_id`
2. If no enrollment found, try the teacher path: look up course by `teacher_id` (or via `course_teachers`)
3. Use whichever `teacher_id` is resolved to download the published plan

```text
Current flow:
  user → enrollments(student_id) → course → teacher_id → download

Updated flow:
  user → enrollments(student_id) → course → teacher_id → download
       ↘ (fallback) courses(teacher_id) → use user.id → download
```

### Implementation Detail
In the `fetchPublishedPlan` function, after the enrollment query returns null, add a fallback:

```ts
let teacherId: string | null = null;

// Student path
const { data: enrollment } = await supabase
  .from("enrollments")
  .select("course_id")
  .eq("student_id", user.id)
  .limit(1)
  .maybeSingle();

if (enrollment?.course_id) {
  const { data: course } = await supabase
    .from("courses")
    .select("teacher_id")
    .eq("id", enrollment.course_id)
    .maybeSingle();
  teacherId = course?.teacher_id ?? null;
} else {
  // Teacher fallback: check if this user owns or collaborates on a course
  const { data: course } = await supabase
    .from("courses")
    .select("teacher_id")
    .eq("teacher_id", user.id)
    .limit(1)
    .maybeSingle();
  teacherId = course?.teacher_id ?? null;
}

if (!teacherId) { setPlanLoading(false); return; }

// Download using resolved teacherId
const { data: fileData, error } = await supabase.storage
  .from("course-materials")
  .download(`${teacherId}/lesson-plan/published-plan.json`);
```

### Files Modified
- `src/pages/student/StudentHome.tsx` — add teacher fallback in `fetchPublishedPlan`

