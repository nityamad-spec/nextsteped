## Goal
Produce a downloadable Excel workbook of all student and course data for **Introduction to Generative AI (GenAI01)** — course id `2ccc8090-8e90-4eee-9e0a-4e94871d4f14`, 437 enrolled students.

## Approach
Reuse the exact same logic as the in-app export (`src/lib/exportCourseToExcel.ts`) so the output matches what teachers/admins already see, but run it server-side via psql + Python (`openpyxl`) and drop the file in `/mnt/documents` for you to download. No app code changes.

## Workbook contents (mirrors in-app export)
1. **Overview** — course metadata (name, code, term, professor, enrollment code, status), enrolled count, diagnostic submitted counts, mastery band distribution, completion counts, quiz/exam totals, chat message total.
2. **Students** — one row per enrolled student: Name, Email, Roll Number, Enrolled At, Diagnostic Status/Score/Level, Final Mastery Level/%, Quizzes Attempted (x/y), Avg Quiz %, Exams Attempted (x/y), Avg Exam %, Chat Messages, Course Completed.
3. **Diagnostic — Submitted** and **Diagnostic — Not Submitted**.
4. **Mastery — Beginner / Developing / Proficient / Expert / Not Started** (5 sheets).
5. **Completion — Completed** and **Completion — Not Completed**.

## Data sources
`courses`, `profiles`, `enrollments`, `diagnostic_results`, `student_course_mastery`, `assessment_results` (daily_quiz + exam modes), `course_exams` (active = not archived), `chat_sessions` + `chat_messages`.

## Deliverable
`Introduction_to_Generative_AI-GenAI01-<today>.xlsx` in `/mnt/documents`, surfaced via `<presentation-artifact>` for one-click download.

## Notes / risks
- Read-only; no schema or app changes.
- Student data is anonymized only in the professor UI — this export includes name/email/roll (matches existing admin export behavior). Let me know if you'd like PII stripped.
- Chat message counts require joining `chat_messages` on ~hundreds of sessions; will be batched.
