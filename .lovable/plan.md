

## Plan: Add `course_material_files` Metadata Table with Course ID

### Overview
Create a database table to track uploaded file metadata including which teacher uploaded it and which course it belongs to, then wire it into the existing upload flow.

### Changes

#### 1. Database Migration — New `course_material_files` table
```sql
CREATE TABLE public.course_material_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL UNIQUE,
  folder_type text NOT NULL,  -- 'syllabus' | 'materials' | 'lesson-plans'
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.course_material_files ENABLE ROW LEVEL SECURITY;
```
RLS: Teachers can SELECT/INSERT/DELETE their own rows (`auth.uid() = teacher_id`).

#### 2. Update `FileUploadZone` component
- Add optional props: `teacherId`, `folderType`, `courseId`.
- On successful storage upload, insert a row into `course_material_files`.
- On file removal, delete the matching row.

#### 3. Update `TeacherOnboarding`
- Since the course doesn't exist yet at upload time, the component will store files first with `courseId = null`, then after the course is created, update all uploaded file rows with the new course ID.
- Pass `teacherId={user.id}` and `folderType` ("syllabus", "materials", "lesson-plans") to each `FileUploadZone`.

### Files Modified
1. New migration — `course_material_files` table + RLS
2. `src/components/FileUploadZone.tsx` — metadata insert/delete
3. `src/pages/teacher/TeacherOnboarding.tsx` — pass props, backfill course_id after course creation

