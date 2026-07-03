## Goal
Replace the single "Export all courses" button on `/admin/courses` with a per-course export that downloads one workbook per course, and expand the export to include student-level detail (diagnostic status, mastery level, completion status).

## UI changes (`src/pages/admin/AdminCourses.tsx`)
- Remove the header-level "Export to Excel" button and `handleExport` for the full list.
- Add a per-row export entry point in two places:
  - A new "Export data" item in the row's `DropdownMenu` (Download icon).
  - Keep the row-click → Course profile dialog behavior unchanged.
- Track `exportingId` state so only the acting row shows a spinner and disables its menu item.
- On success/failure show a toast identifying the course.

## New export util (`src/lib/exportCourseToExcel.ts`)
A single-course exporter that produces `<coursename>-<date>.xlsx` with these sheets:

1. **Overview** — one-row summary of the course (name, code, term, professor, enrollment code, published/enrollment status, totals: enrolled, diagnostic submitted/not, mastery band counts, completed/not-completed, quizzes total, exams total, chat messages).
2. **Students** — one row per enrolled student with:
   - Name, Email, Roll Number, Branch, Enrolled at
   - Diagnostic Status (Submitted / Not Submitted), Diagnostic Score %, Diagnostic Mastery Level
   - Final Mastery Level (Beginner / Developing / Proficient / Expert / Not Started), Final Mastery %
   - Weekly Quizzes Attempted (fraction like `4 / 10`), Avg Quiz Score %
   - Exams Attempted (fraction like `1 / 2`), Avg Exam Score %
   - Chat Messages
   - Course Completed (Yes/No) — using the existing rule: mastery ≥ Proficient AND all weekly quizzes attempted AND all active exams attempted.
3. **Diagnostic — Submitted** — students who completed the diagnostic (Name, Email, Submitted At, Score %, Mastery Level).
4. **Diagnostic — Not Submitted** — enrolled students with no diagnostic row (Name, Email, Enrolled At).
5. **Mastery — Beginner**, **Mastery — Developing**, **Mastery — Proficient**, **Mastery — Expert**, **Mastery — Not Started** — one sheet per band, listing Name, Email, Mastery %, Quizzes Attempted, Exams Attempted.
6. **Completion — Completed** and **Completion — Not Completed** — Name, Email, plus the three gating fields (Mastery Level, Quizzes fraction, Exams fraction) so an admin can see why a student is or isn't complete.

Reused logic (adapted from `exportCoursesToExcel.ts`, scoped to one course_id):
- Enrollment set from `enrollments`.
- Diagnostic from `diagnostic_results` (latest per student; derive mastery level via same thresholds already used in `CourseProfileDialog`/`StudentProfileDialog`).
- Mastery from `student_course_mastery`.
- Active exams from `course_exams` where `archived_at is null` and `published = true` (matches current per-student expectations).
- Quiz/exam attempts from `assessment_results` (`mode = 'daily_quiz'` / `'exam'`), paginated via `fetchAllRange`.
- Chat message counts via `chat_sessions` + `chat_messages` (paginated).
- Student profile info (name/email/roll/branch) from `profiles` for the enrolled ids.

## What we're not changing
- No new tables, no edge functions, no schema changes.
- `exportCoursesToExcel.ts` stays in the repo but is no longer wired to the UI (safe to leave for future reuse; will delete if you prefer).

## Verification
- Type-check.
- Manual: open `/admin/courses`, use the row menu → "Export data" on a course with data; confirm the workbook opens with the sheets above and student counts match the CourseProfileDialog for that course.

## Open question
- Should I delete the now-unused `src/lib/exportCoursesToExcel.ts`, or keep it for a future "export all" option?
