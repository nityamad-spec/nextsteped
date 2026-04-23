

## Track lesson plan JSON path in the database

### Current state

- **Published plan** is already persisted to Storage: `course-materials/{teacher_id}/lesson-plan/published-plan.json`
- **Draft plan** is already persisted to Storage: `course-materials/{teacher_id}/lesson-plan/draft-plan-v2.json`
- **Gap**: the storage paths are hardcoded in 7 places (`CourseCreation`, `TeachingPlan`, `CourseDashboard`, `CourseSetup`, `StudentHome`, `AIChat`, `useTeacherSetupStatus`). The `courses` table has no column referencing them, so the file location isn't authoritative and can't vary per course.

### What changes

**1. Schema migration** — add two nullable columns to `courses`:
| Column | Type | Purpose |
|---|---|---|
| `lesson_plan_path` | text | Storage path of the latest **published** plan JSON |
| `lesson_plan_draft_path` | text | Storage path of the in-progress **draft** plan JSON |
| `lesson_plan_published_at` | timestamptz | When the plan was last published (for cache busting / "last updated" UI) |

No backfill needed — existing teachers' files already live at the predictable path; we'll lazily set the column on next save/publish, and readers fall back to the legacy path if the column is null.

**2. Writer updates (`src/pages/teacher/CourseCreation.tsx`)**

- In `handlePublish`: after the storage upload succeeds, run `supabase.from("courses").update({ lesson_plan_path: "<path>", lesson_plan_published_at: new Date().toISOString() }).eq("id", courseId)`.
- In the debounced draft-sync effect: after the draft upload, update `lesson_plan_draft_path` (only if currently null, to avoid write amplification).
- `TeachingPlan.tsx` save path: same DB update on publish.

**3. Reader updates** — every place that downloads the plan first reads the path from the DB; if the column is null, falls back to the legacy `${teacherId}/lesson-plan/published-plan.json` path so existing courses keep working:
- `src/pages/teacher/CourseCreation.tsx` (draft restore)
- `src/pages/teacher/TeachingPlan.tsx` (load saved plan)
- `src/pages/teacher/CourseDashboard.tsx` (publish-status check)
- `src/pages/teacher/CourseSetup.tsx` (step status)
- `src/pages/student/StudentHome.tsx` (lesson plan widget)
- `src/pages/student/AIChat.tsx` (TA context)
- `src/hooks/useTeacherSetupStatus.ts` (gating check)

A small helper `resolveLessonPlanPath(course, teacherId)` will be added (e.g. `src/lib/lessonPlanPath.ts`) and reused by all readers to keep the fallback logic in one place.

### Files touched

| Path | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Add `lesson_plan_path`, `lesson_plan_draft_path`, `lesson_plan_published_at` to `courses` |
| `src/lib/lessonPlanPath.ts` | New helper for path resolution + DB update |
| `src/pages/teacher/CourseCreation.tsx` | Write DB row on publish + draft sync; read via helper |
| `src/pages/teacher/TeachingPlan.tsx` | Write DB row on save; read via helper |
| `src/pages/teacher/CourseDashboard.tsx` | Read via helper |
| `src/pages/teacher/CourseSetup.tsx` | Read via helper |
| `src/pages/student/StudentHome.tsx` | Read via helper |
| `src/pages/student/AIChat.tsx` | Read via helper |
| `src/hooks/useTeacherSetupStatus.ts` | Read via helper |

### Out of scope

- No change to the on-disk JSON shape or filename.
- No data migration to backfill `lesson_plan_path` for existing courses — fallback handles it.
- No edge-function changes (`generate-lesson-plan` returns the plan in its response; persistence stays client-side as today).

