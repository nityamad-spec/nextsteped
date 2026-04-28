-- =====================================================================
-- Migration: course-id-scoped storage paths
-- =====================================================================
-- Old layout: course-materials/{teacher_id}/<folder>/<file>
-- New layout: course-materials/{course_id}/<folder>/<file>
--
-- This migration is idempotent-safe for already-migrated rows because we
-- only rewrite paths whose first segment is currently a teacher_id.
-- =====================================================================

-- Helper: rewrite the first path segment of a slash-delimited path.
-- Returns NULL if input is NULL.
CREATE OR REPLACE FUNCTION public._rewrite_first_segment(p text, new_first text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR position('/' in p) = 0 THEN p
    ELSE new_first || substring(p from position('/' in p))
  END;
$$;

-- ---------------------------------------------------------------------
-- 1. Backfill `courses` path columns
-- ---------------------------------------------------------------------
-- Only rewrite when the current first segment matches the course's
-- teacher_id (so we don't double-rewrite anything already course-scoped).

UPDATE public.courses c
SET syllabus_json_path = public._rewrite_first_segment(c.syllabus_json_path, c.id::text)
WHERE c.syllabus_json_path IS NOT NULL
  AND split_part(c.syllabus_json_path, '/', 1) = c.teacher_id::text;

UPDATE public.courses c
SET lesson_plan_path = public._rewrite_first_segment(c.lesson_plan_path, c.id::text)
WHERE c.lesson_plan_path IS NOT NULL
  AND split_part(c.lesson_plan_path, '/', 1) = c.teacher_id::text;

UPDATE public.courses c
SET lesson_plan_draft_path = public._rewrite_first_segment(c.lesson_plan_draft_path, c.id::text)
WHERE c.lesson_plan_draft_path IS NOT NULL
  AND split_part(c.lesson_plan_draft_path, '/', 1) = c.teacher_id::text;

-- ---------------------------------------------------------------------
-- 2. Triage orphan course_material_files (course_id IS NULL)
-- ---------------------------------------------------------------------
-- These rows can't be migrated because we don't know which course they
-- belong to. Per the plan we delete them (they're invisible in any
-- course context anyway).
DELETE FROM public.course_material_files WHERE course_id IS NULL;

-- ---------------------------------------------------------------------
-- 3. Backfill course_material_files.storage_path
-- ---------------------------------------------------------------------
UPDATE public.course_material_files f
SET storage_path = public._rewrite_first_segment(f.storage_path, f.course_id::text)
WHERE f.storage_path IS NOT NULL
  AND f.course_id IS NOT NULL
  AND split_part(f.storage_path, '/', 1) = f.teacher_id::text;

-- ---------------------------------------------------------------------
-- 4. Rename actual storage objects to match new paths
-- ---------------------------------------------------------------------
-- For every storage.objects row in `course-materials` whose first
-- segment is a known teacher_id, rewrite to the course id we can
-- resolve from either course_material_files or courses metadata.

-- 4a. Files that have a matching course_material_files row (by NEW path,
--     since we already rewrote the metadata above). For those rows, the
--     storage object's first segment is still the old teacher_id and the
--     rest of the path matches the new metadata path's tail.
WITH old_to_new AS (
  SELECT
    o.name AS old_name,
    f.course_id::text || substring(o.name from position('/' in o.name)) AS new_name
  FROM storage.objects o
  JOIN public.course_material_files f
    ON substring(o.name from position('/' in o.name) + 1)
       = substring(f.storage_path from position('/' in f.storage_path) + 1)
  WHERE o.bucket_id = 'course-materials'
    AND split_part(o.name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND split_part(o.name, '/', 1) <> f.course_id::text
    AND split_part(o.name, '/', 1) = f.teacher_id::text
)
UPDATE storage.objects o
SET name = otn.new_name
FROM old_to_new otn
WHERE o.bucket_id = 'course-materials'
  AND o.name = otn.old_name;

-- 4b. The lesson-plan and syllabus JSON files referenced by `courses`
--     columns. These don't have a course_material_files row.
WITH json_files AS (
  SELECT c.id AS course_id, c.teacher_id, p.path
  FROM public.courses c
  CROSS JOIN LATERAL (
    VALUES (c.syllabus_json_path), (c.lesson_plan_path), (c.lesson_plan_draft_path)
  ) AS p(path)
  WHERE p.path IS NOT NULL
),
old_to_new AS (
  SELECT
    o.name AS old_name,
    j.course_id::text || substring(o.name from position('/' in o.name)) AS new_name
  FROM storage.objects o
  JOIN json_files j
    ON substring(o.name from position('/' in o.name) + 1)
       = substring(j.path from position('/' in j.path) + 1)
   AND split_part(o.name, '/', 1) = j.teacher_id::text
  WHERE o.bucket_id = 'course-materials'
)
UPDATE storage.objects o
SET name = otn.new_name
FROM old_to_new otn
WHERE o.bucket_id = 'course-materials'
  AND o.name = otn.old_name;

-- ---------------------------------------------------------------------
-- 5. Replace storage RLS policies
-- ---------------------------------------------------------------------
-- Old policies key off `(foldername(name))[1] = auth.uid()`.
-- New policies key off course membership / enrollment, using the
-- course id in the first folder segment.

-- Drop old "owner folder" policies and the student lesson-plan policy.
DROP POLICY IF EXISTS "Users can view own course-materials" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own course-materials" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own course-materials" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to course-materials" ON storage.objects;
DROP POLICY IF EXISTS "Students can read lesson plan files" ON storage.objects;

-- Teachers (owner or collaborator) can fully manage files under their
-- course's folder. Path shape required: {course_id}/...
CREATE POLICY "Course members can read course-materials"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND public.is_course_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Course members can upload course-materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-materials'
  AND public.is_course_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Course members can update course-materials"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND public.is_course_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Course members can delete course-materials"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND public.is_course_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- Enrolled students can read lesson-plan, syllabus, and teaching
-- materials for their course. Path shape: {course_id}/{folder}/...
CREATE POLICY "Enrolled students can read course-materials"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[2] IN ('lesson-plan', 'syllabus', 'lesson-plans', 'materials', 'teaching-materials')
  AND EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = auth.uid()
      AND e.course_id::text = (storage.foldername(name))[1]
  )
);

-- ---------------------------------------------------------------------
-- 6. Cleanup helper
-- ---------------------------------------------------------------------
DROP FUNCTION public._rewrite_first_segment(text, text);
