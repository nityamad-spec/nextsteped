

## Plan: Create Concepts Table Linked to Diagnostic Questions

### Summary
Create a `concepts` table to store course concepts (e.g., `PWIM/Python_Environment`, `PWIM/Variables`) with their metadata, then update the `diagnostic_questions` table to reference concepts via a foreign key instead of a plain text `topic` field.

### JSON Structure Observed
Each concept has:
- **`concept_id`** — hierarchical ID like `PWIM/Python_Environment`
- **`weight`** — numeric weight (e.g., 0.03, 0.06) representing importance in the course
- Questions are nested under concepts

### Database Migration

```sql
-- 1. Create concepts table
CREATE TABLE public.concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  concept_id text NOT NULL,          -- e.g. "PWIM/Python_Environment"
  weight numeric(5,4) NOT NULL DEFAULT 0.0,  -- importance weight (0.0 to 1.0)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, concept_id)
);

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

-- Teachers can manage concepts for their own courses
CREATE POLICY "Teachers can manage own concepts"
  ON public.concepts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = concepts.course_id
      AND courses.teacher_id = auth.uid()
  ));

-- Students can view concepts for enrolled courses
CREATE POLICY "Students can view concepts for enrolled courses"
  ON public.concepts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.course_id = concepts.course_id
      AND enrollments.student_id = auth.uid()
  ));

-- 2. Add concept_id FK to diagnostic_questions
ALTER TABLE public.diagnostic_questions
  ADD COLUMN concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL;
```

### Key Design Decisions

- **`concept_id` (text)** stores the hierarchical ID (e.g., `PWIM/Variables`) as a human-readable identifier, separate from the UUID primary key
- **`weight`** captures the concept's relative importance in the course (sums to ~1.0 across all concepts)
- **`UNIQUE(course_id, concept_id)`** prevents duplicate concept IDs within a course
- **Foreign key on `diagnostic_questions.concept_id`** replaces the loose text `topic` field with a proper relational link; uses `SET NULL` on delete so questions survive concept removal
- The existing `topic` text column on `diagnostic_questions` is preserved for backward compatibility (can be deprecated later)
- **No data upload** — this migration only creates the schema

### Files Modified
1. New database migration — create `concepts` table, add FK column to `diagnostic_questions`

