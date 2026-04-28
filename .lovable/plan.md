# Course Status Banner for Teachers

## Problem found while exploring

The student onboarding error "This course isn't open to students yet" is technically correct: the course `Python (PY101)` has `enrollment_open = true` but `published = false`.

Worse — **nothing in the current teacher UI ever sets `courses.published = true`**. The "Publish" step (`PublishEnrollment.tsx`) only flips a local `teacherOnboarded` flag and navigates away. This means no course can ever actually accept students today, regardless of what the teacher does.

So the banner needs to do two jobs:
1. Show clearly where the course stands on the two independent gates.
2. Provide the one-click action to actually publish (which currently has no UI).

## What to build

### 1. New component: `CourseStatusBanner.tsx`

Lives at top of teacher Course Dashboard (and optionally Content Library). Reads `courses.published` and `courses.enrollment_open` for the current `useTeacherCourseId()`.

Shows one of four states:

| `published` | `enrollment_open` | Banner |
|---|---|---|
| false | — | **Amber** — "Course is in Draft. Students cannot see or join." Button: **Publish course** |
| true | true | **Green** — "Course is Live · Enrollment Open. Students can join with code `XXXX`." Button: **Close enrollment** + Copy code |
| true | false | **Blue** — "Course is Live · Enrollment Closed. Existing students keep access; new students cannot join." Button: **Reopen enrollment** |

Each state shows two small status pills side-by-side so both gates are always visible:
- `Published` / `Draft`
- `Enrollment Open` / `Enrollment Closed`

Inline help link "What's the difference?" opens a popover explaining: *Publish makes the course visible to students; Enrollment Open controls whether new students can join the published course.*

### 2. Wire the actions

Both buttons do a simple `supabase.from("courses").update({...}).eq("id", courseId)`. Owner-only (collaborators see read-only banner with note "Only the course owner can publish or change enrollment").

### 3. Fix `PublishEnrollment.tsx`

Add the missing `published = true` update to `handleFinish` so the existing setup-pipeline Publish step actually publishes. This is the real bug behind the user's report.

### 4. Placement

- Top of `CourseDashboard.tsx` (above the existing Collaborator banner).
- Top of `ContentLibrary.tsx` so teachers see status while editing materials.

## Files to change

- **new** `src/components/CourseStatusBanner.tsx`
- `src/pages/teacher/CourseDashboard.tsx` — render banner near top
- `src/pages/teacher/ContentLibrary.tsx` — render banner near top
- `src/pages/teacher/PublishEnrollment.tsx` — actually flip `published = true` in `handleFinish`

## Risks

- **None to data**. Only touches `courses.published` / `courses.enrollment_open` via existing RLS (teacher-owner only).
- Collaborators currently can update courses via `is_course_member` RLS but UX intentionally restricts publish to owners — banner enforces this client-side; this matches the existing "Only the owner can publish" copy on the dashboard.
