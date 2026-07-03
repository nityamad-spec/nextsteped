## Goal
On `/admin/courses`, add a University filter and make the per-course "Export data" respect that filter so the exported workbook only contains students from the selected university.

## Changes

### 1. `src/pages/admin/AdminCourses.tsx`
- Load the `universities` list (id, name) alongside courses/teachers.
- For each course, also load a set of universities represented by its enrolled students (join `enrollments` → `profiles.university_id`). Store as `Set<string>` per course id.
- Add a **University** filter control (shadcn `Select`) above the table:
  - Options: "All universities" (default) + each university by name.
  - When a university is selected, filter the visible course rows to those whose university-set contains that id.
  - Update the "N Courses" header count to reflect the filtered list.
- Pass the currently selected `universityId` (or `null`) into `handleExportCourse` → `exportCourseToExcel`.
- Show the selected university name in the export toast (e.g., "Exported 'X' for <University>").

### 2. `src/lib/exportCourseToExcel.ts`
- Extend `exportCourseToExcel(course, opts?)` to accept `{ universityId?: string | null; universityName?: string | null }`.
- Thread `universityId` into `buildStudentRows(courseId, universityId)`:
  - After fetching enrollments for the course, resolve `profiles.university_id` for those `student_id`s and filter the working set to only students whose `university_id === universityId` when provided.
  - All downstream aggregates (diagnostics, mastery, quiz/exam attempts, chat counts, completion) use the filtered student ids only.
- Reflect the scope in the workbook:
  - Append university to the file name when scoped, e.g., `Course_Export - <Course> - <University>.xlsx`.
  - Add a "University filter" row to the Overview sheet showing the selected university name (or "All universities").

### 3. Empty/edge behavior
- If the selected university has zero enrolled students for a course, the export still succeeds but sheets show 0 rows; overview clearly notes the filter.
- Courses with no students from the selected university are hidden from the list while the filter is active (nothing to export). The dropdown menu on visible rows always exports scoped to the active filter.

## Out of scope
No changes to the CourseProfileDialog analytics, no bulk "export all" button, no changes to `/admin/students`.
