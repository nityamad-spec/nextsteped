

## Plan: AI-Powered Syllabus Quality Check with Structured JSON Pipeline

### Overview
Replace the mock quality check with a real pipeline: (1) convert uploaded syllabus to structured JSON via Gemini 2.5 Pro, (2) have AI review the JSON and flag issues, (3) apply approved/edited corrections back to the JSON, (4) display the final corrected syllabus in readable format for final approval, (5) store the approved JSON in the storage bucket and save its path to the courses table.

### Flow

```text
Syllabus file (PDF/DOCX/etc.)
  ↓  [Edge Function: parse-syllabus]
Structured JSON (sections, topics, descriptions, policies)
  ↓  [Edge Function: quality-check] using Gemini 2.5 Pro
Issues array (referencing JSON paths)
  ↓  [Professor reviews on UI]
Approved/edited corrections applied back to JSON in-memory
  ↓  [All resolved → show final syllabus preview]
Readable paragraph rendering of the corrected JSON
  ↓  [Professor clicks "Approve & Save"]
JSON uploaded to storage bucket → path saved to courses table
```

### Changes

#### 1. Database Migration — Add `syllabus_json_path` to courses table
```sql
ALTER TABLE public.courses ADD COLUMN syllabus_json_path text;
```
Stores the storage path to the approved syllabus JSON file (e.g. `{user_id}/syllabus/approved-syllabus.json`).

#### 2. New Edge Function: `supabase/functions/parse-syllabus/index.ts`
- Receives the raw syllabus file content (text or base64 for binary files).
- Calls `google/gemini-2.5-pro` with a system prompt instructing it to extract a structured syllabus JSON with sections like: course info, schedule/weekly topics, grading policy, learning objectives, rules/policies, resources.
- Uses **tool calling** to guarantee structured JSON output matching a defined schema.
- Returns the structured JSON to the frontend.

#### 3. New Edge Function: `supabase/functions/quality-check/index.ts`
- Receives the structured syllabus JSON.
- Calls `google/gemini-2.5-pro` to review for factual errors, inconsistencies, ambiguities, missing information, and pedagogical issues.
- Uses **tool calling** to return an array of issues, each referencing a `jsonPath` (e.g. `schedule[2].description`), the original text, suggested correction, reason, and severity.
- Returns the issues array.

#### 4. Update `MaterialQualityCheck.tsx` — Full rewrite of logic
- **On mount**: Fetch syllabus files from storage, download content, call `parse-syllabus` edge function → store the resulting JSON in state (`syllabusJson`).
- **After parsing**: Call `quality-check` edge function with the JSON → populate issues list.
- **Issue interface updated**: Each issue now includes a `jsonPath` field pointing to the location in the JSON.
- **On approve/edit**: Apply the correction to `syllabusJson` in-memory using the `jsonPath` — this keeps the JSON semantically consistent.
- **On dismiss**: Leave the JSON unchanged for that path.
- **Once all resolved**: Show a new "Final Syllabus Preview" section at the bottom — renders the corrected JSON as readable formatted paragraphs (section headings, bullet lists, tables for schedule, etc.).
- **"Approve & Save" button**: Uploads the final JSON to the `course-materials` bucket at `{userId}/syllabus/approved-syllabus.json`, then updates the `courses` table with the storage path in `syllabus_json_path`.
- Remove all mock data.

#### 5. Syllabus JSON Schema (used by both edge functions)
```json
{
  "courseTitle": "string",
  "courseCode": "string",
  "instructor": "string",
  "term": "string",
  "description": "string",
  "learningObjectives": ["string"],
  "schedule": [
    { "week": 1, "topic": "string", "description": "string", "readings": "string" }
  ],
  "gradingPolicy": {
    "components": [{ "name": "string", "weight": "string", "description": "string" }]
  },
  "policies": [{ "title": "string", "content": "string" }],
  "resources": ["string"]
}
```

### Technical Details
- **Model**: `google/gemini-2.5-pro` for both parsing and review — strong reasoning and large context window needed for document understanding.
- **Two-step edge function approach**: Separating parsing from review allows re-scanning without re-parsing, and keeps each function focused.
- **JSON path-based corrections**: Each issue targets a specific location in the JSON (e.g. `schedule[3].topic`), so approved corrections can be applied programmatically.
- **Storage**: The approved JSON is stored in the existing `course-materials` bucket. The path is saved to a new `syllabus_json_path` column on the `courses` table.
- **The "Continue" button** remains disabled until the professor approves the final syllabus preview.

### Files Created/Modified
1. **Migration** — add `syllabus_json_path` column to `courses`
2. **New**: `supabase/functions/parse-syllabus/index.ts`
3. **New**: `supabase/functions/quality-check/index.ts`
4. **Modified**: `src/pages/teacher/MaterialQualityCheck.tsx` — full rewrite with real AI pipeline and final preview

