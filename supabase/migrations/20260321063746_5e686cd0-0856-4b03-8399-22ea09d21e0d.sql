
CREATE TABLE public.course_material_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL UNIQUE,
  folder_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_material_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can select own files"
  ON public.course_material_files FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own files"
  ON public.course_material_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own files"
  ON public.course_material_files FOR DELETE
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own files"
  ON public.course_material_files FOR UPDATE
  TO authenticated
  USING (auth.uid() = teacher_id);
