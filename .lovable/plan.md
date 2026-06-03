# Lesson plan missing on student home — root cause + fix

## Root cause

The Python course is correctly set up:
- `courses.published = true`, `lesson_plan_published_at` is set
- 16 rows exist in `lesson_plan_weeks`; Week 1 is `locked = false` (so RLS lets the student read it)
- Akash's `profiles.active_course_id` correctly points at the Python course

The problem is in `src/hooks/useEnrolledCourseId.ts`. The hook seeds its state directly from `localStorage.getItem("enrolledCourseId")` and **only** queries the backend when that value is missing:

```ts
const [courseId, setCourseId] = useState(() => localStorage.getItem("enrolledCourseId"));
useEffect(() => {
  if (courseId || !user) return;   // <-- skipped when localStorage has ANY value
  ...
});
```

If `localStorage.enrolledCourseId` holds a stale id (a previously enrolled / deleted course, a different tenant, or a value carried over from another login on the same browser), the hook returns that stale id forever. In `StudentHome.tsx` the lesson-plan effect then runs:

```ts
const { data: course } = await supabase
  .from("courses")
  .select("teacher_id, start_date, total_weeks, lesson_plan_published_at")
  .eq("id", enrolledCourseId)
  .maybeSingle();
if (!course?.teacher_id) { setPlanLoading(false); return; }
```

The course lookup returns null (RLS hides the stale id), the effect bails before touching `lesson_plan_weeks`, and the UI renders the "Lesson plan not yet available" empty state — even though the real Python plan is published and visible. The teacher-side already had this same bug and was fixed in `useTeacherCourseId.ts`; the student hook never got the same hardening.

## Fix

### 1. Harden `src/hooks/useEnrolledCourseId.ts`

Mirror the validation pattern used in `useTeacherCourseId`:

- Keep the lazy `localStorage` seed for fast first paint.
- Always run a one-shot validation effect that:
  1. If a candidate id exists, confirm there is an `enrollments` row for `(student_id = user.id, course_id = candidate)`. If yes, keep it.
  2. If no, clear `localStorage.enrolledCourseId`, fall back to `profiles.active_course_id` (re-validated against enrollments), then to the most recent `enrollments` row, and persist the resolved id back to both `localStorage` and `profiles.active_course_id`.
  3. Track the last-validated id in a ref so we don't re-validate on every render.
- Expose the same `string | null` return so no call sites change.

### 2. Defensive cleanup in `src/pages/student/StudentHome.tsx`

In the lesson-plan effect, when the `courses` lookup returns null, treat it as a stale-id signal:

- `localStorage.removeItem("enrolledCourseId")`
- Leave `planLoading = false` (current behaviour) but log a warning so future regressions are obvious.

The hardened hook will then resolve the correct id on the next render and the effect re-runs against the real Python course.

### 3. No DB or RLS changes

Verified server-side: RLS on `lesson_plan_weeks` already returns Week 1 for this student. No migration needed.

## Files touched

- `src/hooks/useEnrolledCourseId.ts` — add validation + recovery (≈40 lines).
- `src/pages/student/StudentHome.tsx` — clear stale localStorage on null course lookup (≈3 lines).

## Verification

1. Manually set `localStorage.enrolledCourseId` to a random UUID in the preview, reload `/student/home`, confirm the hook recovers and the Python Week 1 card renders.
2. With a clean localStorage, confirm normal load still works (regression check).
3. With two enrollments, confirm `active_course_id` is honored.
