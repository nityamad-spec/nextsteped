CREATE POLICY "Users can update own course-materials"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);