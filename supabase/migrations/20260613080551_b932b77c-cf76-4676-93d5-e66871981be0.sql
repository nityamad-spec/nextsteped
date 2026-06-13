CREATE UNIQUE INDEX IF NOT EXISTS course_material_files_course_path_uniq
  ON public.course_material_files (course_id, storage_path)
  WHERE course_id IS NOT NULL;