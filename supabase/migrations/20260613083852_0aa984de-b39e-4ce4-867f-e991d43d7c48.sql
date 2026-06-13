DELETE FROM public.course_material_files WHERE course_id IS NULL;
DROP INDEX IF EXISTS public.course_material_files_course_path_uniq;
ALTER TABLE public.course_material_files ALTER COLUMN course_id SET NOT NULL;
ALTER TABLE public.course_material_files ADD CONSTRAINT course_material_files_course_path_uniq UNIQUE (course_id, storage_path);