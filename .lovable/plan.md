## Course Profile Dialog on /admin/courses

Make each course row in `src/pages/admin/AdminCourses.tsx` clickable (same pattern as `/admin/students`) and open a new `CourseProfileDialog` summarizing the course.

### UX
- Whole table row becomes clickable (cursor-pointer, hover bg). The existing Actions dropdown stops row-click propagation so Transfer/Delete still work.
- Dialog uses shadcn `Dialog` + `ScrollArea` (matching `StudentProfileDialog`).

### Sections in the dialog

1. **Header** — course name, code, term, professor name/email, published/enrollment badges, enrollment code.

2. **Enrollment & Diagnostic**
   - Total enrolled students
   - # with diagnostic submission (distinct `student_id` in `diagnostic_results` for the course) + % of enrolled
   - Avg diagnostic score

3. **Course Mastery Bands** (from `student_course_mastery` filtered to enrolled students)
   - Counts in Beginner / Developing / Proficient / Expert
   - Average course mastery % (`Math.floor(avg(score)*100)`)
   - Horizontal stacked bar visual

4. **Completion**
   - "Completed" = student submitted every published weekly quiz (`assessment_results.mode='daily_quiz'`) AND every active (non-archived) exam in `course_exams` AND `student_course_mastery.learner_level` ∈ {Proficient, Expert}
   - Show `X / total` completed + percentage

5. **Assessment activity**
   - Weekly quizzes: # distinct students attempted, total attempts, avg score
   - Exams: same breakdown (excluding archived)
   - Practice questions: total attempts (if tracked) — otherwise skipped

6. **Chat engagement**
   - # students with ≥1 `chat_sessions` row for the course
   - Total chat messages across the course

### Data fetching
- New helper inside the dialog file: parallel queries on open against `enrollments`, `diagnostic_results`, `student_course_mastery`, `assessment_results`, `course_exams`, `assessment_questions` (for published weekly quiz count via `mode='daily_quiz'`), `chat_sessions`, `chat_messages`.
- Aggregation done client-side (admin-only page, low row counts per course).

### Realtime
- Subscribe inside `useEffect` (cleanup on unmount) to postgres_changes on `enrollments`, `assessment_results`, `diagnostic_results`, `student_course_mastery`, `course_exams`, `chat_sessions`, all filtered by `course_id=eq.<id>`. Each event triggers a debounced refetch.
- Tables `enrollments`, `course_exams`, `chat_sessions` need to be added to the `supabase_realtime` publication (migration). The mastery / results tables are already enabled from earlier work.

### Files
- New: `src/components/admin/CourseProfileDialog.tsx`
- Edit: `src/pages/admin/AdminCourses.tsx` — row onClick opens dialog; stop-propagation on the actions cell.
- Migration: add missing tables to realtime publication (idempotent `ALTER PUBLICATION ... ADD TABLE` guarded with DO block).

### Risks / notes
- Completion definition is strict; early in a term most students will show 0% complete — expected.
- Per-course aggregation runs client-side; fine for typical class sizes (<500). If a course grows large we can move to an RPC later.
- Realtime subscriptions are scoped to the open dialog and torn down on close to avoid the reconnection-loop billing issue.
