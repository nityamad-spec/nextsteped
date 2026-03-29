

## Plan: Persist Exam Mode Data Across Page Loads

### Problem
When the teacher navigates away from `/teacher/setup/exam-mode` and returns, the core settings (time limit, difficulty, question mix) reload from the database, but the **approval states** (`examApproved`, `quizApproved`) and **manual question count** settings (`examManualQuestions`, `examManualCount`) reset — blocking the Continue button and losing configuration choices.

### Approach

**1. Database migration** — Add columns to `course_ta_settings`:
```sql
ALTER TABLE public.course_ta_settings
  ADD COLUMN exam_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN quiz_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN exam_manual_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN exam_manual_count integer DEFAULT NULL;
```

**2. `src/hooks/useTASettings.ts`**
- Add the four new fields to `DBTASettings` interface and `dbToAppSettings` mapping
- Include them in the `saveTASettings` upsert payload

**3. `src/types/index.ts`**
- Add `examApproved`, `quizApproved`, `examManualQuestions`, `examManualCount` to the `TASettings` type

**4. `src/pages/teacher/ExamMode.tsx`**
- Initialize `examApproved`, `quizApproved`, `examManualQuestions`, `examManualCount` from `taSettings` in the `useEffect` (instead of hardcoded `false`)
- Include all four fields in the `handleSave` payload

### Files Modified
- 1 database migration
- `src/hooks/useTASettings.ts`
- `src/types/index.ts`
- `src/pages/teacher/ExamMode.tsx`

