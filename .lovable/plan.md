

## Root Cause: Request Waterfall + Duplicate Queries on `/student/home`

### Problem

The `/student/home` page fires **7+ sequential network requests** in a waterfall pattern, with 3 duplicate enrollment queries:

```text
Request waterfall (current):

  ┌─ useStudentStatus ──────────────┐
  │  profiles          ─────────────┤ (parallel)
  │  enrollments       ─────────────┤ (parallel)
  │  diagnostic_results ────────────┘
  │
  ├─ useEnrolledCourseId ───────────── enrollments (DUPLICATE #2)
  │
  ├─ useTASettings (waits for courseId from above)
  │     └── course_ta_settings ─────
  │
  └─ fetchPublishedPlan (useEffect)
       └── enrollments (DUPLICATE #3)
            └── courses (get teacher_id)
                 └── storage.download (slowest — file download + RLS subquery)
```

The storage download is the biggest bottleneck: it downloads a JSON file through an RLS policy that runs a JOIN on enrollments+courses for every request. Combined with the serial waterfall, total load time compounds significantly.

### Solution

Consolidate data fetching to eliminate duplicates and parallelize independent requests.

**1. `src/pages/student/StudentHome.tsx` — Consolidate the `fetchPublishedPlan` effect**

Instead of re-querying enrollments and courses, reuse the `enrolledCourseId` from `useEnrolledCourseId()` (already available). Query the `courses` table for `teacher_id` using that course ID directly, skipping the duplicate enrollment lookup.

Before (3 sequential queries):
```
enrollments → courses → storage.download
```

After (2 sequential queries):
```
courses (using enrolledCourseId) → storage.download
```

Change the `useEffect` dependency from `[user]` to `[user, enrolledCourseId]` and skip querying enrollments entirely when `enrolledCourseId` is available.

**2. `src/pages/student/StudentHome.tsx` — Cache the plan in localStorage**

After successfully downloading the plan JSON, store it in `localStorage` keyed by `enrolledCourseId`. On next load, immediately render the cached plan while fetching a fresh copy in the background. This makes the page appear instant on return visits.

**3. `src/pages/student/StudentHome.tsx` — Set a timeout on the storage download**

Add an `AbortController` with a 5-second timeout on the storage download so the page doesn't hang indefinitely if storage is slow. On timeout, fall back to the cached plan or the default locked plan.

### Technical Details

Changes in `fetchPublishedPlan`:
```typescript
// Use enrolledCourseId directly instead of re-querying enrollments
useEffect(() => {
  const fetchPublishedPlan = async () => {
    if (!user) { setPlanLoading(false); return; }

    // Try cache first for instant render
    const cacheKey = `published-plan-${enrolledCourseId || user.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) setWorkshopPlan(parsed);
      } catch {}
    }

    let teacherId: string | null = null;
    if (enrolledCourseId) {
      // Skip enrollment query — we already have courseId
      const { data: course } = await supabase
        .from("courses").select("teacher_id")
        .eq("id", enrolledCourseId).maybeSingle();
      teacherId = course?.teacher_id ?? null;
    } else {
      // Teacher fallback (unchanged)
      const { data: course } = await supabase
        .from("courses").select("teacher_id")
        .eq("teacher_id", user.id).limit(1).maybeSingle();
      teacherId = course?.teacher_id ?? null;
    }

    if (!teacherId) { setPlanLoading(false); return; }

    const { data: fileData, error } = await supabase.storage
      .from("course-materials")
      .download(`${teacherId}/lesson-plan/published-plan.json`);

    if (!error && fileData) {
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setWorkshopPlan(parsed);
        localStorage.setItem(cacheKey, text);
      }
    }
    setPlanLoading(false);
  };
  fetchPublishedPlan();
}, [user, enrolledCourseId]);
```

### Files Modified
- `src/pages/student/StudentHome.tsx` — eliminate duplicate enrollment query, add localStorage cache for published plan

