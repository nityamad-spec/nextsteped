# Course Analytics — Professor Page

## Goal
Give professors the same rich course profile view that admins see in the `/admin/courses` row dialog, but as a full page in the professor sidebar, scoped to the course currently selected in the CourseSwitcher.

## Scope decisions (confirmed)
- **Data scope:** Current course only (from `useTeacherCourseId` / CourseSwitcher). Auto-updates when the professor switches courses.
- **Nav placement:** Sidebar order becomes: Course Setup, Course Dashboard, Course Assistant, Lesson Plan & Resources, **Course Analytics**, Support.
- **Privacy:** Full identities in roster drill-downs (name + email), same as the admin dialog. Relies on the recent RLS work letting teachers read enrolled students' profiles.
- **Gating:** Locked (with tooltip) until Course Setup is complete, matching Course Dashboard / Assistant / Content Library.

## Deliverables

### 1. Extract shared analytics view
Refactor `src/components/admin/CourseProfileDialog.tsx` into two pieces:
- `src/components/CourseAnalyticsView.tsx` — presentational + data-loading component. Takes a `CourseLite` prop and renders the entire body currently inside the Dialog (header row, university filter, stat cards, mastery bands, roster drill-down panel). No Dialog chrome.
- `src/components/admin/CourseProfileDialog.tsx` — thin wrapper that keeps the Dialog/DialogContent/DialogHeader and renders `<CourseAnalyticsView course={course} />` inside. Admin behavior is unchanged.

Rationale: one source of truth for the analytics UI so admin and professor views stay in sync.

### 2. New professor page
Create `src/pages/teacher/CourseAnalytics.tsx`:
- Resolve the active course via `useTeacherCourseId` (or the same pattern other teacher pages use — CourseSwitcher writes `currentCourseId` to localStorage and pages read it).
- Fetch the minimal `CourseLite` fields (`id, name, course_code, term, enrollment_code, published, enrollment_open`, plus teacher name/email from `profiles` for the owner) for that course id.
- Render `<CourseAnalyticsView course={courseLite} />` inside the standard teacher page shell (page title "Course Analytics", same padding as other teacher pages).
- Loading + empty states: skeleton while course loads; "Select a course to view analytics" if none resolved.

### 3. Route + nav wiring
- `src/App.tsx`: add `<Route path="/teacher/analytics" element={<CourseAnalytics />} />` inside the existing TeacherLayout block (so it inherits `ProtectedRoute` + `RoleGuard allow={["teacher"]}` + `TeacherLayout`).
- `src/layouts/TeacherLayout.tsx`: add a new entry to `teacherNav` between "Lesson Plan & Resources" and "Support":
  ```ts
  { title: "Course Analytics", path: "/teacher/analytics", icon: BarChart3 }
  ```
  No `alwaysUnlocked` flag → automatically gated by the existing setup-complete check, with the same lock icon + tooltip other locked items show.

### 4. RLS / access sanity
No schema changes required. The admin dialog reads: `enrollments`, `profiles`, `universities`, `diagnostic_results`, `student_course_mastery`, `course_exams`, `assessment_results`, `chat_sessions`, `chat_messages`. The teacher already owns / collaborates on the course, so existing "course member" policies plus the recently added `teacher_can_view_student` profile policy cover reads. We will verify by loading the page as a professor after the change; no migration.

## Out of scope
- No changes to admin dialog behavior or layout.
- No new charts / metrics beyond what the admin dialog already shows.
- No student chat content exposure — same aggregate stats (chat_students, chat_messages) the admin sees.
- No CSV export button in this pass (can be a follow-up).

## Verification
1. Sign in as a professor with an existing course + enrollments → sidebar shows "Course Analytics" (unlocked once setup is complete). Clicking it renders the same layout the admin sees for that course.
2. Switch courses in the CourseSwitcher → page reloads stats for the new course.
3. Sign in as a professor whose setup is incomplete → "Course Analytics" appears locked with the tooltip.
4. Admin `/admin/courses` → row click still opens the dialog unchanged.
