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

// Folder types that are single-file-per-course by design — auto-supersede does
// not apply because upsert-by-path already handles refresh.
const AUTO_SUPERSEDE_SKIP: MaterialFolderType[] = [
  "syllabus-json",
  "lesson-plan-draft",
  "lesson-plan-published",
];

/**
 * Normalize a filename for similar-name matching:
 * - Strip extension
 * - Lowercase
 * - Remove trailing version markers like " v2", "_v3", "-final", "(1)"
 * - Collapse separators/whitespace
 */
function normalizedStem(fileName: string): string {
  let s = fileName.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  s = s.replace(/[\s._-]*\(?\bv?\d+\)?$/g, ""); // trailing version marker
  s = s.replace(/[\s._-]*\b(final|draft|copy|updated|new|revised)\b$/g, "");
  s = s.replace(/[\s._-]+/g, " ").trim();
  return s;
}

async function fireIngest(fileId: string, fileName: string) {
  if (!fileName.toLowerCase().endsWith(".pdf")) return;
  void supabase.functions
    .invoke("ingest-rag-document", { body: { file_id: fileId } })
    .catch((e) => console.warn("ingest-rag-document invoke failed:", e));
}

async function autoSupersedeSimilar(args: {
  course_id: string;
  folder_type: MaterialFolderType;
  new_file_id: string;
  new_file_name: string;
}): Promise<void> {
  if (AUTO_SUPERSEDE_SKIP.includes(args.folder_type)) return;
  const newStem = normalizedStem(args.new_file_name);
  if (!newStem) return;

  const { data: peers, error } = await supabase
    .from("course_material_files")
    .select("id, file_name")
    .eq("course_id", args.course_id)
    .eq("folder_type", args.folder_type)
    .is("superseded_by", null)
    .neq("id", args.new_file_id);
  if (error || !peers) return;

  const matches = peers.filter((p) => normalizedStem(p.file_name) === newStem);
  // Strict: only supersede when there is exactly one match to avoid ambiguity.
  if (matches.length !== 1) return;

  const target = matches[0];
  const { error: updErr } = await supabase
    .from("course_material_files")
    .update({
      superseded_by: args.new_file_id,
      superseded_at: new Date().toISOString(),
    })
    .eq("id", target.id);
  if (updErr) {
    console.warn("autoSupersedeSimilar update failed:", updErr.message);
  }
}

/**
 * Register/refresh a row in course_material_files for a file that was just
 * uploaded to the course-materials storage bucket.
 *
 * Uses ON CONFLICT (course_id, storage_path) so re-uploads of the same path
 * update size/timestamp instead of creating duplicate rows. If a NEW row is
 * created and a same-stem peer exists in the same folder, the peer is marked
 * superseded so retrieval switches to the fresh version immediately.
 */
export async function upsertCourseMaterialFile(
  args: UpsertCourseMaterialFileArgs,
): Promise<void> {
  // Detect whether this upsert will hit an existing row so we know if it's a
  // "new file, similar name" case or a same-path re-upload.
  const { data: existing } = await supabase
    .from("course_material_files")
    .select("id")
    .eq("course_id", args.course_id)
    .eq("storage_path", args.storage_path)
    .maybeSingle();

  const { data, error } = await supabase
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
    )
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    console.error("upsertCourseMaterialFile failed:", error?.message, args);
    return;
  }

  // New row → attempt guarded auto-supersede by similar filename.
  if (!existing) {
    await autoSupersedeSimilar({
      course_id: args.course_id,
      folder_type: args.folder_type,
      new_file_id: data.id,
      new_file_name: args.file_name,
    });
  }

  await fireIngest(data.id, args.file_name);
}

export interface ReplaceCourseMaterialFileArgs {
  old_file_id: string;
  new_upload: UpsertCourseMaterialFileArgs;
}

/**
 * Explicit "Replace" operation. Assumes the new file has already been uploaded
 * to storage at `new_upload.storage_path` (should be a fresh, unique path).
 *
 * Steps:
 * 1. Insert a new course_material_files row for the new upload.
 * 2. Stamp the old row with superseded_by = new row id → retrieval instantly
 *    switches away from the old chunks (match_rag_chunks filters them out).
 * 3. Fire RAG ingest on the new row.
 *
 * The old storage object + row are NOT deleted here; call
 * `cleanupSupersededFile(old_file_id)` once you're satisfied with the new
 * version, or leave them for the teacher to delete manually.
 */
export async function replaceCourseMaterialFile(
  args: ReplaceCourseMaterialFileArgs,
): Promise<{ new_file_id: string } | null> {
  const { new_upload, old_file_id } = args;

  const { data: inserted, error: insErr } = await supabase
    .from("course_material_files")
    .insert({
      course_id: new_upload.course_id,
      teacher_id: new_upload.teacher_id,
      storage_path: new_upload.storage_path,
      file_name: new_upload.file_name,
      file_size: new_upload.file_size,
      folder_type: new_upload.folder_type,
    })
    .select("id")
    .maybeSingle();
  if (insErr || !inserted?.id) {
    console.error("replaceCourseMaterialFile insert failed:", insErr?.message);
    return null;
  }

  const { error: supErr } = await supabase
    .from("course_material_files")
    .update({
      superseded_by: inserted.id,
      superseded_at: new Date().toISOString(),
    })
    .eq("id", old_file_id);
  if (supErr) {
    console.warn("replaceCourseMaterialFile supersede failed:", supErr.message);
  }

  await fireIngest(inserted.id, new_upload.file_name);
  return { new_file_id: inserted.id };
}

/**
 * Delete the storage object and DB row for a superseded file. Chunks cascade
 * via the rag_chunks FK. Intended to be called after the replacement has been
 * successfully indexed.
 */
export async function cleanupSupersededFile(
  file_id: string,
): Promise<void> {
  const { data: row } = await supabase
    .from("course_material_files")
    .select("id, storage_path, superseded_by")
    .eq("id", file_id)
    .maybeSingle();
  if (!row) return;
  if (!row.superseded_by) {
    console.warn("cleanupSupersededFile: row is not superseded, aborting");
    return;
  }
  await supabase.storage.from("course-materials").remove([row.storage_path]);
  await supabase.from("course_material_files").delete().eq("id", row.id);
}
