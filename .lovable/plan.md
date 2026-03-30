

## Plan: Persist Student Assessment Results to Database

### Problem
When students complete exams or quizzes, results are only logged as a chat message summary. No structured data is saved, so teachers cannot access scores, answers, or time-spent analytics.

### Approach

**1. Database migration** — Create `assessment_results` table

```sql
CREATE TABLE public.assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  course_id uuid,
  mode text NOT NULL,           -- 'exam' or 'daily_quiz'
  quiz_day integer,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  correct_answers integer NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  time_spent integer NOT NULL,  -- seconds
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS:
- Students can INSERT own results (`auth.uid() = student_id`)
- Students can SELECT own results
- Teachers can SELECT results for their courses (`is_course_member`)

**2. `src/pages/student/AIChat.tsx`** — Save results on submit

In `handleAssessmentSubmit`, after the existing chat message logic, insert a row into `assessment_results` with:
- `student_id`: `user.id`
- `course_id`: `enrolledCourseId`
- `mode`: `assessmentType === "quiz" ? "daily_quiz" : "exam"`
- `quiz_day`: `assessmentDay` (for quizzes)
- `score`: `results.score`
- `total_questions`: `results.totalQuestions`
- `correct_answers`: `results.correctAnswers`
- `answers`: `results.answers`
- `time_spent`: `results.timeSpent`

### Files Modified
- 1 database migration (new `assessment_results` table + RLS)
- `src/pages/student/AIChat.tsx` — insert result row in `handleAssessmentSubmit`

