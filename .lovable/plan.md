## Plan

Additively align `assessment_questions` and `assessment_results` with their diagnostic counterparts. Existing rows in both tables will be wiped first so new NOT NULL columns (`concept_id`) can be enforced cleanly. All existing assessment-only columns stay so `WeeklyQuizDialog`, `ExamMode`, `seed-questions`, `update-mastery`, and `AssessmentAnalytics` keep working.

### Single migration

**1. Wipe data (preserves schema, RLS, FKs):**
- `DELETE FROM public.assessment_results;`
- `DELETE FROM public.assessment_questions;`

**2. `assessment_questions` — add diagnostic-style columns:**
- `concept_id uuid NOT NULL` → FK `concepts(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- `item_code text NOT NULL DEFAULT ''`
- `format text NOT NULL DEFAULT 'mcq'`
- `tier text NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard','easy','medium','hard'))`
- `in_test boolean NOT NULL DEFAULT false`
- `difficulty_estimate numeric(3,2) NOT NULL DEFAULT 0.5`
- `bloom_level int NOT NULL DEFAULT 1`
- `bloom_justification text`
- `difficulty_justification text`
- `is_distractor boolean NOT NULL DEFAULT false`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- Indexes: `(concept_id)`, `(course_id, tier)`
- BEFORE INSERT/UPDATE trigger calling a new SECURITY DEFINER function `assessment_questions_validate_topic()` that enforces `topic == concepts.concept_code` for the supplied `concept_id` (same logic as `diagnostic_questions_validate_topic`)
- BEFORE UPDATE trigger calling existing `update_updated_at_column()`

Kept as-is: `mode`, `quiz_day`, `question_type`, `question_text`, `answer`, `topic`, `difficulty`, `options`, `correct_index`, `explanation`, `teacher_id`, `course_id`, RLS policies.

**3. `assessment_results` — add diagnostic-style columns:**
- `learner_level text NOT NULL DEFAULT 'developing'`
- `branch_tier text CHECK (branch_tier IN ('easy','medium','hard'))`
- `mastery_score numeric(5,4)`
- `confidences jsonb NOT NULL DEFAULT '[]'`
- `question_times jsonb NOT NULL DEFAULT '[]'`
- `question_ids jsonb NOT NULL DEFAULT '[]'`

Kept as-is: `mode`, `quiz_day`, `score`, `total_questions`, `correct_answers`, `answers`, `time_spent`, RLS policies.

Note: NOT applying diagnostic's `UNIQUE (student_id, course_id)` — assessments produce many rows per student/course (one per quiz day, per exam attempt).

### Out of scope (this turn)
- Updating edge functions (`seed-questions`, etc.) or frontend code to actually populate the new columns. Defaults keep current writes working; population can come next.
- Renaming any existing columns.

### Risk
- Wipes all historical assessment data (teacher-seeded questions and student quiz results). User confirmed this.
- The `topic == concepts.concept_code` trigger will fail any future insert into `assessment_questions` whose topic doesn't match. `seed-questions` currently writes free-form `topic`; it will need to set `topic = concept_code` and a real `concept_id` going forward. Flagging so we update it in a follow-up.
