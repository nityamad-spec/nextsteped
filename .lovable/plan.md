

## Plan: Use Teacher-Created Database Questions for Exams & Quizzes

### Problem
The teacher's Assessments page manages questions **only in local component state** (seeded from mock data). Questions are never saved to the database. The student exam/quiz system pulls from a **static `questionBank.ts`** file. Teacher-configured custom questions are completely disconnected from what students actually see.

### Approach

**1. Database migration** — Create an `assessment_questions` table

```sql
CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  mode text NOT NULL,              -- 'exam' or 'daily_quiz'
  question_type text NOT NULL DEFAULT 'MCQ',  -- 'MCQ', 'Short Answer', 'Code Practice'
  question_text text NOT NULL,
  answer text NOT NULL,
  topic text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Medium',
  options jsonb,                   -- MCQ options array
  correct_index integer,           -- for MCQ
  explanation text,
  quiz_day integer,                -- 1 or 2, for daily_quiz mode only
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;
-- Teachers manage own questions
-- Students can SELECT for enrolled courses
```

**2. `src/pages/teacher/Assessments.tsx`** — Persist questions to database
- On mount, fetch questions from `assessment_questions` where `course_id` matches
- `handleSave` → upsert to `assessment_questions` table instead of local state only
- Delete → delete from DB
- Remove seed/mock data dependency

**3. `src/pages/student/AIChat.tsx`** — Fetch questions from database
- Replace `getQuizQuestions(day, count)` with a Supabase query: `SELECT * FROM assessment_questions WHERE course_id = ? AND mode = 'daily_quiz' AND quiz_day = ?`, then shuffle and slice to `count`
- Replace `getExamQuestions(count)` with: `SELECT * FROM assessment_questions WHERE course_id = ? AND mode = 'exam'`, then shuffle and slice
- Use `taSettings.examTimeLimit` for exam time (currently hardcoded)
- Use `taSettings.examManualCount` or a default for exam question count (currently hardcoded to 15)
- Map DB rows to the `Question` interface expected by `AssessmentView`

**4. `src/components/AssessmentView.tsx`** — No structural changes needed
- The existing `Question` interface already supports `mcq` type with `options`, `correctAnswer`, `topic`, `difficulty` — the DB fetch layer just maps to this shape

**5. `src/data/questionBank.ts`** — Keep as fallback
- If no DB questions exist for a course, fall back to static bank (graceful degradation)
- Eventually can be removed once all courses have teacher-created questions

### Files Modified
- 1 database migration (new `assessment_questions` table + RLS)
- `src/pages/teacher/Assessments.tsx` — CRUD against database
- `src/pages/student/AIChat.tsx` — fetch from DB, respect TA settings for exam count/time
- `src/data/questionBank.ts` — retained as fallback only

