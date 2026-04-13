import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Check, X, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UploadedFile {
  name: string;
  size: number;
  path: string;
}

interface FileUploadZoneProps {
  folderPath: string;
  accept: string;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  /** If provided, metadata rows are inserted into course_material_files */
  teacherId?: string;
  folderType?: string;
  courseId?: string | null;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const FileUploadZone = ({ folderPath, accept, files, onFilesChange, teacherId, folderType, courseId }: FileUploadZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    // Ensure we have a fresh session token before uploading
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.warn("Session refresh failed, proceeding with current session:", refreshError.message);
    }

    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10 MB limit`);
        continue;
      }

      const filePath = `${folderPath}/${Date.now()}_${file.name}`;

      const { error } = await supabase.storage
        .from("course-materials")
        .upload(filePath, file);

      if (error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      } else {
        // Insert metadata row if teacherId & folderType provided
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
      }
    }

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
      toast.success(`${newFiles.length} file(s) uploaded`);
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = async (file: UploadedFile) => {
    const { error } = await supabase.storage
      .from("course-materials")
      .remove([file.path]);

    if (error) {
      toast.error(`Failed to remove ${file.name}`);
      return;
    }

    // Delete metadata row
    if (teacherId && folderType) {
      await supabase
        .from("course_material_files")
        .delete()
        .eq("storage_path", file.path);
    }

    onFilesChange(files.filter((f) => f.path !== file.path));
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

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
            <span className="text-sm text-muted-foreground">Click to upload files</span>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
