## Goal
Add a university selector to the Course Profile dialog on `/admin/courses` so admins can scope all analytics to students from one university enrolled in that course.

## Changes (frontend-only, single file: `src/components/admin/CourseProfileDialog.tsx`)

1. **Fetch enrolled-students' universities**
   - Join `enrollments` (for the open `courseId`) → `profiles.university_id` → `universities.name`.
   - Build a deduped list of universities that actually have ≥1 enrolled student in this course.
   - Include a count next to each option, e.g. "CMR Institute of Technology (12)".

2. **Dropdown UI**
   - Add a shadcn `Select` at the top of the dialog (under the course header, above "Enrollment & Diagnostic").
   - Options: `All universities (76)` (default) + one per university found.
   - If only 0–1 universities exist, hide the dropdown (no value in showing it).
   - Also show a small "No university set" bucket if some enrolled profiles have `university_id = null` (selectable, so admins can audit incomplete profiles).

3. **Filter all analytics by selected university**
   - Compute a `filteredStudentIds: Set<string>` from enrollments ∩ profiles matching the selected `university_id` (or all when "All").
   - Apply this filter to every existing metric in the dialog:
     - Enrolled count
     - Diagnostic done / Avg diagnostic
     - Course mastery distribution + Avg %
     - Course completion (quizzes + exams + mastery ≥ Proficient)
     - Assessment activity (attempts, avg score)
     - Chat engagement
     - Concept-level heatmap
   - Denominators (e.g., "X / Y") use the filtered enrolled count, not the global count.

4. **Realtime behavior unchanged**
   - Existing subscriptions stay; filter is applied client-side after data arrives, so realtime updates flow into the currently selected view automatically.

## Risks / Edge Cases
- **Small sample sizes:** A university with 1–2 students can make averages noisy. Mitigation: show the filtered enrolled count prominently so the admin sees the sample size.
- **Null university_id:** Older profiles may not have a university set. Handled via the "No university set" bucket so they aren't silently dropped.
- **Privacy:** Filtering by university narrows the cohort but the dialog already aggregates (no per-student PII shown), so no new exposure.
- **Performance:** One extra join on dialog open; negligible at current scale (≤ hundreds of enrollments per course).

## Out of scope
- No DB schema changes.
- No changes to the courses list page itself.
- Dropdown is not persisted across dialog opens (resets to "All").