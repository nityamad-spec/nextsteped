# Export students to Excel on /admin/students

## Scope
Add an "Export to Excel" button in the Students card header (next to search). Exports the **currently filtered** list (respects search, course filter, mastery filter) as a multi-sheet `.xlsx` workbook.

## UI
- Button placement: header row of the Students card, left of the search input (or beside "Clear filters"). Uses `Download` icon from lucide-react.
- Disabled while data is loading or `filtered.length === 0`.
- Shows a spinner + "Exporting…" state while per-course insights are being fetched.
- On success: toast "Exported N students".
- Filename: `students-export-YYYY-MM-DD.xlsx`.

## Workbook structure (3 sheets)

**Sheet 1 — Students**
One row per student group (already deduped by email).
Columns: Name, Email, Roll Number, Joined (ISO), # Courses, Courses (comma-joined), Accounts (profileIds count).

**Sheet 2 — Enrollments**
One row per student × course.
Columns: Student Name, Email, Course, Enrolled At, Final Mastery Level.

**Sheet 3 — Course Insights**
One row per student × course with the same analytics already computed inside `StudentProfileDialog` (reused via a small shared helper).
Columns: Student Name, Email, Course, Diagnostic Level, Diagnostic %, Final Mastery Level, Final Mastery %, Weekly Quizzes Attempted, Weekly Quizzes Total, Avg Quiz Score %, Exams Attempted, Exams Total, Avg Exam Score %, Proficient Concepts, Total Concepts, Strong Concepts (semicolon-joined), Weak Concepts (semicolon-joined), Chat Messages, Practice Questions Attempted, Practice Accuracy %.

Missing values render as empty cells (not "—").

## Implementation

1. **Extract shared insights fetcher** — pull the per-course analytics query logic currently inside `src/components/admin/StudentProfileDialog.tsx` into a new module `src/lib/studentInsights.ts` exporting `fetchStudentCourseInsights(studentIds, courseIds)` returning a `Map<"studentId:courseId", InsightRow>`. Refactor `StudentProfileDialog` to consume it (behavior unchanged).
2. **New util** `src/lib/exportStudentsToExcel.ts` using `xlsx` (SheetJS). Builds the three sheets from the passed `filtered: StudentGroup[]` plus the insights map, then triggers download via `XLSX.writeFile`.
3. **AdminStudents.tsx** — add `Download` button, `exporting` state, `handleExport` that:
   - Collects all `{studentId, courseId}` pairs from `filtered`.
   - Calls `fetchStudentCourseInsights` in one batch.
   - Calls `exportStudentsToExcel(filtered, insights)`.
   - Toasts result / catches errors.
4. **Dependency** — add `xlsx` (SheetJS) via `bun add xlsx`. ~400KB gzipped; loaded statically (button is admin-only, low traffic). If size is a concern we can switch to dynamic `import()` inside the handler — will do dynamic import to keep the admin bundle lean.

## Out of scope
- No CSV alternative, no row-level checkbox selection, no server-side export.
- No schema or edge function changes.
- No changes to non-admin pages.
