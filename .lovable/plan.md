# Wire new upload boxes to backend (storage + table only)

## Already working
`FileUploadZone` uploads to bucket `course-materials` at the path given by `folderPath` and inserts a row in `course_material_files` with the supplied `folderType`. The new cards already pass:
- `folderPath={courseId}/lesson-plan-docs`, `folderType="lesson-plan-docs"`
- `folderPath={courseId}/youtube-links`, `folderType="youtube-links"`

`course_material_files.folder_type` is free-form `text` (no CHECK), so both upload types persist correctly with **no schema change** to that table.

## 1. New table for YouTube links
Create `public.course_youtube_links` so links are queryable independent of the source doc.

Columns:
- `id uuid pk default gen_random_uuid()`
- `course_id uuid not null`
- `teacher_id uuid not null` (uploader)
- `source_file_id uuid` (nullable — id of the row in `course_material_files`)
- `url text not null` (canonical full URL)
- `video_id text` (parsed 11-char YouTube id; nullable for playlist/channel)
- `kind text not null default 'video'` (`video` | `playlist` | `channel` | `other`)
- `created_at timestamptz not null default now()`
- Unique `(course_id, url)` to dedupe re-uploads

GRANTs + RLS (mirror `course_material_files`):
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`
- Teachers manage own rows: `auth.uid() = teacher_id`
- Collaborators read/write via `is_course_member(course_id, auth.uid())`
- Enrolled students `SELECT` only (so a future student view can surface the links)
- Admins full access via `is_admin(auth.uid())`

## 2. Edge function `extract-youtube-links`
New `supabase/functions/extract-youtube-links/index.ts`.

Input: `{ courseId, fileId, storagePath }` — called by the client right after a successful upload into the `youtube-links` folder.

Steps:
1. Validate JWT, confirm caller is a course member.
2. Download the file from storage with the service-role client.
3. Extract raw text:
   - `.txt` / `.csv` → decode directly
   - `.pdf` / `.docx` → send to Lovable AI Gateway (Gemini 2.5 flash-lite) with prompt: "Return every YouTube URL you find, one per line, nothing else."
4. Regex over the text for `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/playlist?list=…`, `youtube.com/channel/…`, `youtube.com/@handle`. Normalize, classify `kind` + `video_id`.
5. Upsert into `course_youtube_links` on conflict `(course_id, url)`.
6. Return `{ inserted, skipped, total }`.

## 3. Client wiring in `CourseMaterials.tsx`
- After a successful upload in the YouTube Links zone, invoke `extract-youtube-links` and toast the result ("Found N YouTube links" / "No YouTube links detected").
- Render the current list from `course_youtube_links` for this course under the YouTube card (URL + remove button), so the professor sees extraction worked.
- Lesson Plans card needs no extra wiring — files just sit in storage + table for later use.

May need a small `onUploadComplete?(file)` callback added to `FileUploadZone` if one doesn't already exist; confirmed during build.

## Files touched
- **Migration (new):** `course_youtube_links` table + GRANTs + RLS.
- **New edge function:** `supabase/functions/extract-youtube-links/index.ts`.
- **Edit:** `src/pages/teacher/CourseMaterials.tsx` — trigger extraction after upload, render extracted links list.
- **Maybe edit:** `src/components/FileUploadZone.tsx` — add `onUploadComplete` callback if missing.

## Explicitly out of scope
- No changes to `generate-lesson-plan` — wiring the new sources into plan generation comes later.
- No YouTube Data API calls (no titles/durations fetched).
- No manual "add link" form (table supports it; UI can come later).
