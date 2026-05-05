import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Check, X, FileText, Loader2, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { markStepCompleted } from "@/lib/setupProgress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UploadedFile {
  name: string;
  size: number;
  path: string;
}

type ParseStatus = "parsing" | "parsed" | "failed";

interface FileUploadZoneProps {
  folderPath: string;
  accept: string;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  /** Course this upload belongs to. Required to insert course_material_files
   *  rows, drive syllabus parsing, and write the parsed JSON to a path the
   *  course-membership storage RLS allows. */
  courseId?: string | null;
  /** Required when courseId is set: the uid that gets stamped onto
   *  course_material_files.teacher_id (audit trail of who uploaded). */
  teacherId?: string;
  folderType?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "FILE";
}

// Read a File as raw base64 (no data: prefix), in chunks to avoid stack overflow on large PDFs.
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
    );
  }
  return btoa(binary);
}

const FileUploadZone = ({ folderPath, accept, files, onFilesChange, courseId, teacherId, folderType }: FileUploadZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null);
  // Per-file parse status keyed by storage_path. Only used for syllabus uploads.
  const [parseStatus, setParseStatus] = useState<Record<string, ParseStatus>>({});

  const handleSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const valid: File[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10 MB limit`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) {
      setPending((prev) => [...prev, ...valid]);
      setConfirmed(false);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const removePending = (idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
    setConfirmed(false);
  };

  /**
   * Fire-and-forget syllabus parsing. Calls parse-syllabus edge function,
   * writes JSON to {courseId}/syllabus/approved-syllabus.json, and updates
   * courses.syllabus_json_path. Requires courseId — without it we cannot
   * write to a path the course-membership storage RLS allows.
   *
   * Source can be either an in-memory File (fresh upload) or a storage path
   * (retry after failure — file downloaded from bucket and re-encoded).
   */
  const parseSyllabusInBackground = async (
    source: { file: File; storagePath: string } | { storagePath: string; fileName: string }
  ) => {
    if (!courseId) {
      // Without a course we have nowhere to put the parsed JSON.
      // CourseMaterials.handleNext() creates the course row on Next click,
      // and re-running parse from there will pick up the new courseId.
      return;
    }
    const storagePath = source.storagePath;
    setParseStatus((prev) => ({ ...prev, [storagePath]: "parsing" }));
    try {
      let fileBase64: string;
      let fileName: string;
      if ("file" in source) {
        fileBase64 = await fileToBase64(source.file);
        fileName = source.file.name;
      } else {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("course-materials")
          .download(storagePath);
        if (dlErr || !blob) throw new Error(dlErr?.message || "Failed to download file for retry");
        const asFile = new File([blob], source.fileName, { type: blob.type });
        fileBase64 = await fileToBase64(asFile);
        fileName = source.fileName;
      }

      const { data, error } = await supabase.functions.invoke("parse-syllabus", {
        body: { fileBase64, fileName },
      });
      if (error) throw new Error(error.message);
      const syllabusJson = (data as any)?.syllabus;
      if (!syllabusJson) throw new Error("Empty parser response");

      const jsonPath = `${courseId}/syllabus/approved-syllabus.json`;
      const blob = new Blob([JSON.stringify(syllabusJson, null, 2)], {
        type: "application/json",
      });
      const { error: uploadErr } = await supabase.storage
        .from("course-materials")
        .upload(jsonPath, blob, { upsert: true, contentType: "application/json" });
      if (uploadErr) throw new Error(uploadErr.message);

      await supabase
        .from("courses")
        .update({ syllabus_json_path: jsonPath })
        .eq("id", courseId);

      if (teacherId) void markStepCompleted(teacherId, "upload", courseId);

      setParseStatus((prev) => ({ ...prev, [storagePath]: "parsed" }));
    } catch (err) {
      console.warn("Syllabus parse failed:", err);
      setParseStatus((prev) => ({ ...prev, [storagePath]: "failed" }));
    }
  };

  const retryParse = (file: UploadedFile) => {
    void parseSyllabusInBackground({ storagePath: file.path, fileName: file.name });
  };

  const handleConfirmedUpload = async () => {
    if (pending.length === 0 || !confirmed) return;
    setUploading(true);

    // Ensure we have a fresh session token before uploading
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.warn("Session refresh failed, proceeding with current session:", refreshError.message);
    }

    const newFiles: UploadedFile[] = [];
    const syllabusToParse: Array<{ file: File; path: string }> = [];

    for (const file of pending) {
      const filePath = `${folderPath}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from("course-materials")
        .upload(filePath, file);

      if (error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      } else {
        if (teacherId && folderType) {
          const { error: metaError } = await supabase
            .from("course_material_files")
            .insert({
              teacher_id: teacherId,
              course_id: courseId ?? null,
              file_name: file.name,
              file_size: file.size,
              storage_path: filePath,
              folder_type: folderType,
            });
          if (metaError) {
            console.error("Failed to save file metadata:", metaError.message);
          }
        }
        newFiles.push({ name: file.name, size: file.size, path: filePath });
        if (folderType === "syllabus") {
          syllabusToParse.push({ file, path: filePath });
        }
      }
    }

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
      toast.success(`${newFiles.length} file(s) uploaded`);
    }

    setPending([]);
    setConfirmed(false);
    setUploading(false);

    // Kick off background parsing for syllabus files. Non-blocking.
    for (const { file, path } of syllabusToParse) {
      void parseSyllabusInBackground({ file, storagePath: path });
    }
  };

  const performDelete = async () => {
    const file = deleteTarget;
    if (!file) return;
    const { error } = await supabase.storage
      .from("course-materials")
      .remove([file.path]);

    if (error) {
      toast.error(`Failed to remove ${file.name}`);
      setDeleteTarget(null);
      return;
    }

    if (teacherId && folderType) {
      await supabase
        .from("course_material_files")
        .delete()
        .eq("storage_path", file.path);
    }

    const remaining = files.filter((f) => f.path !== file.path);
    onFilesChange(remaining);

    // If this was the last syllabus file, clear the parsed JSON + course pointer.
    if (folderType === "syllabus" && courseId && remaining.length === 0) {
      const jsonPath = `${courseId}/syllabus/approved-syllabus.json`;
      await supabase.storage.from("course-materials").remove([jsonPath]).catch(() => {});
      await supabase
        .from("courses")
        .update({ syllabus_json_path: null })
        .eq("id", courseId);
    }

    setParseStatus((prev) => {
      const next = { ...prev };
      delete next[file.path];
      return next;
    });
    toast.success(`Removed "${file.name}"`);
    setDeleteTarget(null);
  };

  const renderParsePill = (filePath: string) => {
    const status = parseStatus[filePath];
    if (!status) return null;
    if (status === "parsing") {
      return (
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Parsing…
        </span>
      );
    }
    if (status === "parsed") {
      return (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          Parsed ✓
        </span>
      );
    }
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
        Parse failed
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleSelect(e.target.files)}
      />

      {/* Drop / select zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
          files.length > 0
            ? "border-primary/50 bg-primary/5"
            : "border-muted hover:border-primary/30 hover:bg-muted/50"
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Uploading…</span>
          </>
        ) : files.length > 0 ? (
          <>
            <Check className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary">
              {files.length} file(s) uploaded — click to add more
            </span>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Click to select files</span>
          </>
        )}
      </div>

      {/* Pending review panel */}
      {pending.length > 0 && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Review files before uploading</p>
            <p className="text-xs text-muted-foreground">
              Confirm these are the correct materials for your course.
            </p>
          </div>

          <div className="space-y-1.5">
            {pending.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{f.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {getExt(f.name)}
                </span>
                <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removePending(idx)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove from list"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground leading-relaxed">
              I confirm these materials are correct and aligned to my course syllabus.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPending([]); setConfirmed(false); }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmedUpload}
              disabled={!confirmed || uploading}
            >
              {uploading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="mr-2 h-3.5 w-3.5" /> Upload {pending.length} file{pending.length > 1 ? "s" : ""}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Existing files list */}
      {files.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              {folderType === "syllabus" && renderParsePill(f.path)}
              {folderType === "syllabus" && parseStatus[f.path] === "failed" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    retryParse(f);
                  }}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Retry parsing this syllabus"
                >
                  <RefreshCw className="h-2.5 w-2.5" /> Retry
                </button>
              )}
              <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(f);
                }}
                className="text-muted-foreground hover:text-destructive"
                title="Delete file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This will remove it from your course materials and may affect concept mapping.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FileUploadZone;
