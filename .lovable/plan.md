## Goal

On `/admin/students`, when an admin opens a student, keep the existing compact per-course card as the summary and add an expandable section per course with quiz-level performance, exam scores, strong/weak concepts, and engagement stats.

## Scope

Frontend-only change to `src/components/admin/StudentProfileDialog.tsx`. No schema, RLS, or edge function changes.

## UX

Each course card keeps its current header (name, mastery level, progress bar, quizzes/exams/expert counts) and gains a "Show details" chevron that expands an accordion with four subsections:

1. **Weekly quizzes** — one row per week that has attempts:
   - Best score % + attempt count badge.
   - Expand row to see every attempt: date, score, time spent, pass/fail (>50%).
2. **Exams** — one row per exam week:
   - Best score %, attempts.
   - Expand to see per-attempt date, score, time spent.
3. **Concepts** — two columns:
   - Strong: concepts where `mastery_level` ∈ {proficient, expert}.
   - Weak: concepts where `mastery_level` ∈ {beginner, developing}.
   - Each shown as concept name + level badge; capped at ~8 per column with "+N more".
4. **Engagement** — inline stat row:
   - Chat sessions count, chat messages count, last chat activity date (from `chat_sessions` + `chat_messages`).
   - Practice questions attempted + accuracy % (from `assessment_results` where `mode = 'practice'`).
   - Total time on assessments (sum of `question_times` across quiz + exam attempts) and avg time per question.

Only one course expanded at a time (accordion). Loading skeleton inside the expanded panel while its detail query runs. Realtime subscriptions already in place remain unchanged.

## Data fetching

Summary query stays as-is on dialog open. Detail query fires lazily the first time a course is expanded and is cached in component state keyed by `courseId`.

Per-course detail query (single Promise.all):
- `assessment_results` filtered by `student_id in profileIds` and `course_id`, selecting `mode, quiz_day, score, total_questions, question_times, created_at, exam_id` — used for both quiz history, exam history, and time-on-task.
- `student_concept_mastery` joined with `concepts(name, concept_code)` filtered by student + course — used for strong/weak lists.
- `chat_sessions` filtered by `user_id in profileIds` and `course_id`, selecting `id, updated_at, created_at`.
- `chat_messages` count via head-select `count: 'exact'` scoped by those session ids.
- `course_exams` for the course to label exam attempts by exam name.

Aggregation done client-side:
- Group quiz attempts by `quiz_day`; compute best %, attempts, per-attempt rows.
- Group exam attempts by `exam_id`; compute best %, attempts, per-attempt rows.
- Bucket concepts by `mastery_level`; sort within bucket by `mastery_score` desc for strong / asc for weak.
- Engagement totals summed from arrays.

## Technical notes

- New collapsible rows use existing shadcn `Accordion` (course level) and `Collapsible` (attempt history) to stay consistent.
- Times displayed as `mm:ss` via a small formatter; percentages via `Math.floor(score / total * 100)`.
- All new UI respects existing `ScrollArea` sizing; expanded content is inside the scroll viewport.
- Realtime debounce already invalidates summary; on invalidation, cached detail for the currently-open course is also refetched.

## Out of scope

- Any admin-side aggregate page changes.
- Changes to student-facing screens.
- Schema, RLS, or edge function work.
