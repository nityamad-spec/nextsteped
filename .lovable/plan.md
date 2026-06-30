## Add "Course Analytics" tab to teacher sidebar

### 1. Sidebar nav (`src/layouts/TeacherLayout.tsx`)
- Add new item to `teacherNav` directly below "Course Dashboard":
  - title: `"Course Analytics"`, path: `/teacher/courses/analytics`, icon: `BarChart3` (from lucide-react).
- Gated by setup completion like other non-setup links (no `alwaysUnlocked`).

### 2. New page `src/pages/teacher/CourseAnalytics.tsx`
- Resolve current course via `useTeacherCourseId()`.
- Render the same analytics surface as the admin Course Profile dialog, scoped to that course, as a full page (no Dialog wrapper):
  - Enrollment / diagnostic done & pending (clickable lists with names+emails)
  - Mastery distribution bars (Beginner / Developing / Proficient / Expert)
  - Course completion: Completed / Not completed (clickable lists)
  - Assessment activity:
    - Weekly quizzes: Completed all N / Partially done (with "X of N done · Y left") / Not started
    - Exams: Completed all N / Not completed, plus Avg score
  - Chat engagement summary
- Include the **university filter dropdown** (only universities with enrolled students in this course), re-deriving all metrics client-side via the same memo logic.

### 3. Refactor for reuse (`src/components/admin/CourseProfileDialog.tsx`)
- Extract the body of `CourseProfileDialog` into a new presentational component `src/components/admin/CourseProfileContent.tsx` that accepts `{ courseId, courseName }` and renders the analytics + sub-dialogs (no outer `Dialog`).
- `CourseProfileDialog` becomes a thin wrapper: `<Dialog><DialogContent><CourseProfileContent .../></DialogContent></Dialog>` — admin behavior unchanged.
- `CourseAnalytics.tsx` renders `<CourseProfileContent courseId={...} courseName={...} />` inside a normal page layout (title + container).

### 4. Routing (`src/App.tsx`)
- Add `<Route path="/teacher/courses/analytics" element={<CourseAnalytics />} />` inside the existing teacher `TeacherLayout` route block (so it inherits ProtectedRoute + RoleGuard + layout).

### Technical notes
- No backend / RLS changes needed: teachers already read `enrollments`, `assessment_results`, `course_exams`, `concept_mastery`, `course_mastery`, `profiles` for their own course. If any query 403s under teacher RLS during smoke test, fix by narrowing the select or adjusting the policy in a follow-up.
- No schema changes. No memory updates.
- Out of scope: mobile bottom-nav already maps from `teacherNav`, so the new tab appears there automatically with no extra work.
