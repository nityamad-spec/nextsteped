

## Plan: Edge Function to Seed Diagnostic Questions

### Clarification
You mentioned "course_materials table" — based on our earlier conversation, this should be the **diagnostic_questions** table. The plan proceeds with that assumption.

### Edge Function: `seed-questions`

**File**: `supabase/functions/seed-questions/index.ts`

Accepts the full question_bank JSON, transforms all questions, and bulk-inserts them into `diagnostic_questions`.

### Transformation Rules
- `single_token_fill` → `short_answer` (options = null)
- `code_output` → `short_answer` (options = null)
- `code_completion` → `short_answer` (options = null)
- `match_following` → **skip**
- `mcq` → `mcq` (parse options from content_text, strip them from the text)
- `true_false` → `true_false` (options = `["True", "False"]`, answer mapped to "A"/"B")

### Logic
1. Parse incoming JSON (`fileContent`)
2. Look up PWIM course → get `course_id` and `teacher_id` (course owner)
3. Look up all concepts for the course from `concepts` table → build a `concept_code → UUID` map
4. Iterate each concept's questions:
   - Skip `match_following` format
   - Map format names as above
   - For MCQ: extract options from content_text lines (A/B/C/D), strip them from content, store as JSON array
   - For true_false: set options to `["True", "False"]`, map answer "True"→"A", "False"→"B"
   - For short_answer: options = null, answer = raw text
   - Map `item_id` → `item_code`
5. Delete existing diagnostic_questions for this course
6. Bulk insert all transformed rows

### Config
Add `[functions.seed-questions]` with `verify_jwt = false` to `supabase/config.toml`.

### Files Modified
1. `supabase/functions/seed-questions/index.ts` — new edge function
2. `supabase/config.toml` — add function config block

