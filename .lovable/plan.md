# Lesson Plans upload → extract → save `uploaded-lesson-plan.json`

When a teacher uploads a doc to the "Lesson Plans" card in `/teacher/setup/upload`, parse the document(s) into structured JSON and persist the result at `course-materials/{courseId}/lesson-plan/uploaded-lesson-plan.json` (upsert, overwrites any previous extraction).

The raw uploaded files keep flowing into `{courseId}/lesson-plan-docs/...` and into `course_material_files` as today — only the new JSON sidecar is added.

## 1. New edge function `extract-lesson-plan`

Path: `supabase/functions/extract-lesson-plan/index.ts`. CORS + JWT validate + `is_course_member` check (same pattern as `extract-youtube-links` / `parse-syllabus`).

Input: `{ courseId }`. The function:
1. Loads all rows from `course_material_files` where `course_id = courseId AND folder_type = 'lesson-plan-docs'` via service-role client.
2. Downloads each file from `course-materials` and base64-encodes it (mime mapping reuses the table from `parse-syllabus`).
3. Calls Lovable AI Gateway (`google/gemini-2.5-pro`) with a strict tool-call schema → returns the merged plan as:
   ```
   { weeks: [{ week, week_name, overview, concepts: [{name, brief_description}], resources: [{type, title, description, url}] }],
     overall_course_learning_outcomes: string }
   ```
   This matches Shape B that `normalizeLessonPlan` already understands, so downstream readers work without changes. System prompt: "Extract ONLY what's in the documents. Do not invent weeks or concepts. If multiple files cover the same week, merge."
4. Writes the result to `{courseId}/lesson-plan/uploaded-lesson-plan.json` via `storage.upload(..., { upsert: true, contentType: 'application/json' })`.
5. Returns `{ path, weekCount }`.

Errors return JSON with CORS headers; rate-limit (429) and credit (402) handled like `parse-syllabus`.

## 2. Client wiring

`src/pages/teacher/CourseMaterials.tsx` — the Lesson Plans `FileUploadZone` already has `onUploadComplete`. Add a handler that calls `supabase.functions.invoke('extract-lesson-plan', { body: { courseId } })` and toasts "Extracted N weeks from lesson plan docs" / "Couldn't extract a structured plan from the uploaded files." Non-blocking; UI doesn't wait beyond the toast.

A lightweight in-card status line ("Last extraction: just now · N weeks") is shown when extraction completes in the current session. No new persistent state.

## 3. Storage & DB

- No new tables. No new columns. Path is fully derivable from `courseId`, identical convention to `published-plan.json` / `draft-plan-v2.json`.
- Existing storage RLS on `course-materials` already grants course members read/write under the `{courseId}/...` prefix, so no policy changes.

## Files touched

- **New:** `supabase/functions/extract-lesson-plan/index.ts`
- **Edit:** `src/pages/teacher/CourseMaterials.tsx` (Lesson Plans card `onUploadComplete` + tiny status text)

## Explicitly out of scope

- No changes to `generate-lesson-plan` or any reader of the published plan.
- No re-extraction trigger on file delete (stale JSON remains until next upload). Can add later.
- No UI to view/edit the extracted JSON in this pass.
