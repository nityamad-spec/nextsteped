import { supabase } from "@/integrations/supabase/client";

export type MaterialFolderType =
  | "syllabus"
  | "materials"
  | "lesson-plans"
  | "syllabus-json"
  | "lesson-plan-draft"
  | "lesson-plan-published";

export interface UpsertCourseMaterialFileArgs {
  course_id: string;
  teacher_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  folder_type: MaterialFolderType;
}

/**
 * Register/refresh a row in course_material_files for a file that was just
 * uploaded to the course-materials storage bucket.
 *
 * Uses ON CONFLICT (course_id, storage_path) so re-uploads of the same path
 * (e.g. approved-syllabus.json, published-plan.json) update size/timestamp
 * instead of creating duplicate rows. The partial unique index that supports
 * this conflict target is defined in migration
 * course_material_files_course_path_uniq.
 */
export async function upsertCourseMaterialFile(
  args: UpsertCourseMaterialFileArgs,
): Promise<void> {
  const { error } = await supabase
    .from("course_material_files")
    .upsert(
      {
        course_id: args.course_id,
        teacher_id: args.teacher_id,
        storage_path: args.storage_path,
        file_name: args.file_name,
        file_size: args.file_size,
        folder_type: args.folder_type,
      },
      { onConflict: "course_id,storage_path" },
    );
  if (error) {
    console.error("upsertCourseMaterialFile failed:", error.message, args);
  }
}
