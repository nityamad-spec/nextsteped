
-- Drop existing storage policies that require course to exist
DROP POLICY IF EXISTS "Teachers can upload course materials" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can view course materials" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete course materials" ON storage.objects;

-- Simpler policies: authenticated users can manage files in their own user folder
CREATE POLICY "Users can upload to course-materials"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own course-materials"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own course-materials"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
