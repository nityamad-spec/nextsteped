

## Plan: Fix Duplicate Courses and Add Course-Scoped Queries

### Problem
1. **Duplicate courses**: `handleContinue` in TeacherOnboarding always runs `INSERT`, creating a new course every time the teacher revisits onboarding.
2. **Missing course scoping**: Quality check page and file queries filter only by `teacher_id`, not `course_id`. The `handleApproveAndSave` updates ALL courses for a teacher instead of a specific one.

### Changes

#### 1. Upsert logic in TeacherOnboarding
**File: `src/pages/teacher/TeacherOnboarding.tsx`**

- In `handleContinue`, before inserting a new course, check if a course already exists for this teacher (query `courses` where `teacher_id = user.id`).
- If a course exists: **update** it with the new field values and use its existing `id`.
- If no course exists: **insert** a new one (current behavior).
- Same for profile: update `name`, `department`, `graduation_year` on existing profile instead of skipping.
- Store the resolved `courseId` in a ref or variable for the file backfill step.

#### 2. Store course_id in app state / pass it forward
**File: `src/pages/teacher/TeacherOnboarding.tsx`**

- After upsert, store the `courseId` in `localStorage` (e.g. `currentCourseId`) so downstream pages can access it.
- Pass it via navigation state as well: `navigate("/teacher/setup/quality-check", { state: { courseId } })`.

#### 3. Scope quality check queries by course_id
**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

- On mount, read `courseId` from navigation state or `localStorage`.
- Update the file fetch query (line 200) to also filter `.eq("course_id", courseId)` when available.
- Update `handleApproveAndSave` (line 296) to update the specific course by `id` instead of by `teacher_id`.

#### 4. Scope onboarding file fetch by course_id
**File: `src/pages/teacher/TeacherOnboarding.tsx`**

- In the mount `useEffect`, after fetching the latest course, use its `id` to scope the `course_material_files` query with `.eq("course_id", courseId)`.

### Files Modified
1. `src/pages/teacher/TeacherOnboarding.tsx` — upsert logic, course-scoped file fetch, pass courseId forward
2. `src/pages/teacher/MaterialQualityCheck.tsx` — read courseId, scope file and save queries by course_id

