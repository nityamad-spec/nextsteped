

## Plan: Store Question IDs in Diagnostic Results

### Problem
The `diagnostic_results` table stores `answers`, `confidences`, and `question_times` as plain arrays indexed by position. No question IDs are recorded. If a teacher later adds, removes, or reorders diagnostic questions, historical per-question analysis breaks because the positional mapping is lost.

### Solution
Replace the flat arrays with an array of structured objects that include the question ID, and add a `course_id` column for easier querying.

### Database Migration
Add a `question_ids` JSONB column and `course_id` UUID column to `diagnostic_results`:

```sql
ALTER TABLE diagnostic_results
  ADD COLUMN question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN course_id uuid;
```

No existing data is broken — old rows simply have empty `question_ids` and null `course_id`.

### Code Change: `src/pages/student/DiagnosticQuiz.tsx`

1. **Track question IDs alongside answers** — add a `questionIds` state array that collects `question.id` at each step (parallel to `answers`, `confidences`, `questionTimes`).

2. **Include in DB insert** — when saving results, add:
   - `question_ids: questionIds` (array of UUID strings, positionally aligned with `answers`)
   - `course_id`: derived from the first question's course association or from the student's enrolled course

The insert becomes:
```typescript
await supabase.from("diagnostic_results").insert({
  student_id: user.id,
  score: correct,
  total_questions: total,
  learner_level: level,
  answers: newAnswers,
  confidences: newConfidences,
  question_times: newQuestionTimes,
  question_ids: questionIds,   // NEW
  course_id: questions[0]?.courseId, // NEW (optional)
});
```

3. **Populate `questionIds`** in `handleAnswer`:
```typescript
const newQuestionIds = [...questionIds, question.id];
setQuestionIds(newQuestionIds);
```

### Files Modified
1. **Database migration** — add `question_ids` and `course_id` columns to `diagnostic_results`
2. **`src/pages/student/DiagnosticQuiz.tsx`** — track and store question IDs alongside answers

### Backward Compatibility
- Old results with empty `question_ids` still work; `score` and `learner_level` remain valid
- New results enable per-question drill-down even after the question bank changes

