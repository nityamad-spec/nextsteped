
## Goal
Produce a downloadable, comprehensive Excel workbook covering every student in **Generative AI Leader (GAIL)** (course_id `42e995c8-…e3a3`, 401 enrolled students) for offline learning analysis.

## Deliverable
A single file written to `/mnt/documents/GAIL-student-report-<YYYY-MM-DD>.xlsx`, surfaced via a `<presentation-artifact>` tag so you can preview / download it directly.

## Workbook contents
One sheet per view, all filtered to the GAIL course:

1. **Course Overview** — course metadata, teacher, term, published state, totals (students, concepts, weeks, exams, quiz weeks, chat sessions, assessment attempts).
2. **Students** — one row per enrolled student: name, email, roll number, enrolled_at, final mastery level & %, diagnostic level & %, quizzes attempted / total, avg quiz %, exams attempted / total, avg exam %, proficient concepts / total, strong concepts, weak concepts, chat messages, practice attempts, practice accuracy %. (Same shape as the app's existing "Course Insights" export, restricted to this course.)
3. **Concepts** — the 15 course concepts with weights and, per concept, cohort stats: # students with mastery rows, avg mastery %, count by level (Beginner / Developing / Proficient / Expert).
4. **Concept Mastery (per student)** — long table: student × concept → mastery_level, mastery_score, attempts, correct, last_updated (all 5,581 rows).
5. **Diagnostic Results** — every diagnostic attempt (401 rows): student, learner_level, mastery_score, raw score, created_at, plus any per-concept breakdown stored on the row.
6. **Assessment Results** — all 7,526 attempts: student, mode (daily_quiz / exam / practice), quiz_day or exam title, score %, correct / total, time_spent, created_at.
7. **Weekly Quiz Summary** — per student × week matrix of quiz scores (attempted vs not, best %).
8. **Exam Summary** — per student × exam matrix: attempted, score %, correct/total, submitted_at.
9. **Chat Engagement** — per student: session count, message count, last activity; plus a second block with per-session message counts.
10. **Practice Questions** — per student: attempts, total questions, correct, accuracy %, last attempt.

## How it will be built
- Pull all rows with `supabase--read_query` (chunked with LIMIT/OFFSET where any table exceeds 1000 rows — assessment_results, concept mastery, chat messages).
- Join student names/emails from `profiles`; concept codes from `concepts`; week labels from `lesson_plan_weeks`; exam titles from `course_exams`.
- Assemble in Python with `pandas` + `openpyxl`, applying the project's formatting conventions (frozen header row, bold headers, number/percent formats, autosized columns, `-` for zeros where meaningful).
- Verify the file opens cleanly and every sheet has the expected row counts before handing it over.
- No code in the app is changed; this is a one-off analytical artifact.

## Privacy note
Per project memory, student data is normally anonymised when shown to professors in-app. This export is a teacher-facing analytical file and will include student names, emails, and roll numbers so you can identify individuals. Tell me if you'd prefer it anonymised (hash IDs, drop email) and I'll switch before generating.

## Technical notes
- Source: Lovable Cloud (Supabase) tables `courses`, `enrollments`, `profiles`, `concepts`, `student_concept_mastery`, `student_course_mastery`, `diagnostic_results`, `assessment_results`, `course_exams`, `lesson_plan_weeks`, `chat_sessions`, `chat_messages`.
- Output path: `/mnt/documents/GAIL-student-report-<date>.xlsx` (single file, ~10 sheets).
- No schema changes, no edge function changes, no migrations.
