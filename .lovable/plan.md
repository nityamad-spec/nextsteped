

## Plan: Edge Function to Seed Concepts from JSON

### Summary
Create a backend function that accepts the uploaded JSON, extracts the concept IDs and weights from the top-level `concepts` array, looks up the course by `course_code = 'PWIM'`, and inserts concept rows into the `concepts` table. No UI changes.

### Edge Function: `seed-concepts`

**File**: `supabase/functions/seed-concepts/index.ts`

1. Accept POST with `{ fileContent: string }` (the raw JSON string)
2. Parse JSON, extract `concepts` array — each entry has `concept_id` and `weight`
3. Use service role client to query `courses` where `course_code = 'PWIM'` to get the course UUID
4. Delete existing concepts for that course (to avoid duplicates on re-run)
5. Insert all `{ concept_id, weight, course_id }` rows into the `concepts` table
6. Return count of inserted concepts

### Config
Add `[functions.seed-concepts]` with `verify_jwt = false` to `supabase/config.toml`.

### Invocation
After deploying, call the function once with the uploaded JSON content to populate the database. This is a one-time data seeding operation.

### Files Modified
1. `supabase/functions/seed-concepts/index.ts` — new edge function
2. `supabase/config.toml` — add function config block

