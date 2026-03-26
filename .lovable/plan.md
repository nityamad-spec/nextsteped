

## Plan: Load Diagnostic Questions from Database Only

### Problem
The page initializes with a hardcoded `generatedQuestions` array (7 mock questions). It should load exclusively from the `diagnostic_questions` table and show an empty state when no questions exist.

### Changes

**File: `src/pages/teacher/DiagnosticQuestionsSetup.tsx`**

1. **Remove `generatedQuestions` array** (lines 81-145) entirely
2. **Import `supabase` client and `useEffect`**; get `useAuth` for `user.id`
3. **Initialize `questions` as empty array** instead of `generatedQuestions`
4. **Add loading state** (`loading: boolean`) and fetch on mount:
   - Get `courseId` from `localStorage.getItem("currentCourseId")`
   - Query `supabase.from("diagnostic_questions").select("*").eq("course_id", courseId)`
   - Map DB rows to `DiagnosticQuestion` UI type (content_text → question, format → type, difficulty_estimate → difficulty label, options jsonb → options array, answer → correctAnswer/correctIndex, etc.)
   - If no rows returned, set empty array (no seeding with mock data)
5. **Show loading spinner** while fetching; show empty state message ("No questions yet. Click + to add your first question.") when loaded but empty
6. **Persist on save/edit**: Upsert to `diagnostic_questions` on save (insert if new, update if existing DB id)
7. **Persist on delete**: Delete row from `diagnostic_questions` by DB id
8. **Persist on add**: Insert new row immediately when adding a question
9. **Track DB id** alongside local id for each question (add `dbId?: string` to interface)

### Data Mapping (DB → UI)
- `content_text` → `question`
- `format` → `type`
- `difficulty_estimate` → `difficultyEstimate` + derive `difficulty` label
- `bloom_level` → `bloomLevel`
- `bloom_justification` → `bloomJustification`
- `difficulty_justification` → `difficultyJustification`
- `is_distractor` → `isDistractor`
- `item_id` → `itemId`
- `options` (jsonb) → `options` array
- `answer` → derive `correctIndex` (for MCQ: find index of matching option letter) or `correctAnswer`
- `explanation` → `explanation`
- `topic` → `topic`

### Files Modified
1. `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — remove mock data, add DB fetch/persist logic

