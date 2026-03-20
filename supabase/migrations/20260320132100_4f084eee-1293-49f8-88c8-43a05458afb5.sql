
-- Create storage bucket for course materials
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('course-materials', 'course-materials', false, 10485760);

-- Allow teachers to upload files to their course folders
CREATE POLICY "Teachers can upload course materials"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-materials'
  AND EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id::text = (storage.foldername(name))[1]
    AND courses.teacher_id = auth.uid()
  )
);

-- Allow teachers to view their course files
CREATE POLICY "Teachers can view course materials"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-materials'
  AND EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id::text = (storage.foldername(name))[1]
    AND courses.teacher_id = auth.uid()
  )
);

-- Allow teachers to delete their course files
CREATE POLICY "Teachers can delete course materials"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id::text = (storage.foldername(name))[1]
    AND courses.teacher_id = auth.uid()
  )
);
