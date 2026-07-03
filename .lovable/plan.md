# Export courses to Excel on /admin/courses

## Scope
Add an "Export to Excel" button to the Courses card header on `/admin/courses`. Exports every course currently listed (the page has no filters yet, so this is all courses) as a multi-sheet `.xlsx` workbook.

## UI
- Placement: right side of the `CardHeader` (title stays on the left), same visual pattern as the Students export.
- Icon: `Download` from lucide-react.
- Disabled while data is loading or when there are zero courses.
- Shows a spinner + "Exporting…" label while per-course analytics are being fetched.
- On success: toast "Exported N courses". On failure: error toast.
- Filename: `courses-export-YYYY-MM-DD.xlsx`.

## Workbook structure (3 sheets)

**Sheet 1 — Courses**
One row per course (same data already in the table).
Columns: Name, Course Code, Term, Professor, Professor Email, Enrollment Code, Status (Published/Draft), Enrollment (Open/Closed), Students, Created At.

**Sheet 2 — Course Analytics**
One row per course with the analytics already computed inside `CourseProfileDialog` (no university filter — always the full roster).
Columns: Course, Course Code, Enrolled, Diagnostic Submitted, Diagnostic Avg %, Avg Mastery %, Mastery Beginner, Mastery Developing, Mastery Proficient, Mastery Expert, Mastery Not Started, Course Completed, Weekly Quizzes Total, Quiz Attempts, Students Attempted Quiz, Avg Quiz Score %, Exams Total, Exam Attempts, Students Attempted Exam, Avg Exam Score %, Chat Students, Chat Messages.

**Sheet 3 — Mastery Distribution**
One row per (course × band) for easy pivoting.
Columns: Course, Course Code, Mastery Band, Student Count, % of Enrolled.

Empty/unknown metrics render as blank cells (not "—").

## Implementation

1. **Extract shared analytics fetcher** — pull the per-course analytics query + aggregation logic out of `src/components/admin/CourseProfileDialog.tsx` into a new module `src/lib/courseInsights.ts` exporting:
   - `fetchCourseInsights(courseIds: string[]): Promise<Map<string, CourseInsightRow>>`
   - Types (`CourseInsightRow`) reused by both the dialog and the exporter.
   The dialog is refactored to call the shared fetcher for a single course; behavior is unchanged (still respects realtime updates and university filter — the filter stays UI-side over the raw data returned).
2. **New util** `src/lib/exportCoursesToExcel.ts` (dynamic `import("xlsx")` to keep the admin bundle lean, matching the students export). Builds the three sheets from the `CourseRow[]` plus the insights map, then triggers download via `XLSX.writeFile`.
3. **`AdminCourses.tsx`** — add `Download` button in the `CardHeader`, `exporting` state, `handleExport` that:
   - Collects all course IDs from `courses`.
   - Calls `fetchCourseInsights` once.
   - Calls `exportCoursesToExcel(courses, insights)`.
   - Toasts result / catches errors.

## Out of scope
- No CSV alternative, no row-selection, no server-side export.
- No schema, edge function, or RLS changes.
- No changes to non-admin pages.
- No per-student breakdown in the export (that already exists on `/admin/students`).
