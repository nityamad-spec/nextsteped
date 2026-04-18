
## Diagnosis

The "Generation failed: No course selected" screen appears because:

1. **Auth bypass auto-signs in as the seeded admin** (`admin@nextstep.ai`), not as a teacher.
2. The admin user has **no rows in `courses` with `teacher_id = admin.id`**, and there's no `currentCourseId` in `localStorage`.
3. You navigated/reloaded directly onto `/teacher/setup/lesson-plan` (skipping the Materials → Continue path that auto-creates a draft course).
4. `CourseCreation.tsx` (line 80) reads `courseId` from `location.state` OR `localStorage.getItem("currentCourseId")` — both are null, so `runGeneration` fails at line 168 with exactly that message.

The auth bypass made the bug visible because admin doesn't naturally own a course. Pre-bypass, a logged-in teacher would have had a course in their localStorage from earlier flows.

Secondary risk: the page's data-load `useEffect` doesn't wait for the async admin auto-signin — when `user` is briefly null on mount, no draft is restored and generation tries to fire empty.

## Fix Plan

**1. Auto-recover a course on the lesson plan page** (`src/pages/teacher/CourseCreation.tsx`)
- In the existing `useEffect` that triggers generation, if `courseId` is missing AND `user` is loaded, look up the most recent course owned by `user.id` (`teacher_id = user.id`, order by `created_at desc`, limit 1).
- If found → use it, also write to `localStorage.currentCourseId` so subsequent steps see it.
- If still none → render a clearer empty state with a "Go to Course Materials" CTA instead of the cryptic error (the existing "Back to materials" button stays, but messaging changes).

**2. Wait for `user` before kicking off generation**
- Currently the effect only depends on `phase`, `weeks.length`, `restoringDraft`, `runGeneration`. With auth bypass, `user` arrives a tick late. Add a guard so `runGeneration` only fires when `user` is non-null, and include `user` in the effect deps.

**3. Optional: surface the bypass identity in dev**
- Log `[AUTH_BYPASS] signed in as admin <id>` once on AuthContext mount so it's obvious in console which user is driving requests during testing.

## Files to touch
- `src/pages/teacher/CourseCreation.tsx` — add course auto-resolution + user-ready guard + clearer empty-state copy.
- (No DB or AuthContext changes needed.)

## Revert
Pure additive logic; safe to keep even after `AUTH_BYPASS = false`.
