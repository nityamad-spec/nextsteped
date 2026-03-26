

## Plan: Create Backend Table for Diagnostic Test Questions

### Summary
Create a `diagnostic_questions` table in the database to store professor-defined diagnostic quiz questions with the rich metadata format provided (item_id, bloom level, difficulty estimate, distractor flag, etc.). This replaces the current hardcoded `questionBank.ts` approach.

### Database Migration

Create table `diagnostic_questions`:

```sql
CREATE TABLE public.diagnostic_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_id text NOT NULL,                    -- e.g. "PWIM/Python_Environment/Q001"
  content_text text NOT NULL,               -- full question text including options
  format text NOT NULL DEFAULT 'mcq',       -- mcq, true_false, short_answer, code
  answer text NOT NULL,                     -- correct answer (e.g. "B")
  difficulty_estimate numeric(3,2) NOT NULL DEFAULT 0.5, -- 0.0 to 1.0
  bloom_level integer NOT NULL DEFAULT 1,   -- 1-6 (Bloom's taxonomy)
  bloom_justification text,
  difficulty_justification text,
  is_distractor boolean NOT NULL DEFAULT false,
  topic text,                               -- e.g. "Python_Environment"
  options jsonb,                            -- array of option strings for MCQ
  explanation text,                         -- why the answer is correct
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.diagnostic_questions ENABLE ROW LEVEL SECURITY;

-- Teachers can fully manage their own questions
CREATE POLICY "Teachers can manage own diagnostic questions"
  ON public.diagnostic_questions FOR ALL
  TO authenticated
  USING (auth.uid() = teacher_id);

-- Students can view questions for courses they're enrolled in
CREATE POLICY "Students can view diagnostic questions for enrolled courses"
  ON public.diagnostic_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.course_id = diagnostic_questions.course_id
        AND enrollments.student_id = auth.uid()
    )
  );
```

### Key Design Decisions

- **`item_id`** stores the hierarchical ID format (e.g. `PWIM/Python_Environment/Q001`) as a text field for flexible naming
- **`difficulty_estimate`** is a numeric 0-1 scale (not the Easy/Medium/Hard enum) to match the provided format
- **`bloom_level`** is an integer 1-6 mapping to Bloom's taxonomy levels
- **`options`** stored as JSONB array for flexible option counts
- **`is_distractor`** boolean flag preserved from the provided schema
- **`course_id` + `teacher_id`** foreign keys for ownership and access control
- RLS ensures teachers manage their own questions and students can only read questions for enrolled courses

### Files Modified
1. New database migration — create `diagnostic_questions` table with RLS policies

