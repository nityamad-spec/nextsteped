
-- Admin full access to course-materials storage bucket
CREATE POLICY "Admins can view all course-materials"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-materials'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can upload to course-materials"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-materials'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can update course-materials"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'course-materials'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can delete course-materials"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-materials'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
