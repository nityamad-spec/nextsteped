DROP POLICY "Students can read lesson plan files" ON storage.objects;

CREATE POLICY "Students can read lesson plan files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(objects.name))[2] = 'lesson-plan'
  AND EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = auth.uid()
      AND (storage.foldername(objects.name))[1] = c.teacher_id::text
  )
);