import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Check, X, FileText, Loader2, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
  /** Hard cap on total uploaded files (existing + new). Default unlimited. */
  maxFiles?: number;
  /** Notify parent of per-file parse status changes (syllabus only). */
  onParseStatusChange?: (statuses: Record<string, ParseStatus>) => void;
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

const FileUploadZone = ({ folderPath, accept, files, onFilesChange, courseId, teacherId, folderType, maxFiles, onParseStatusChange }: FileUploadZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null);
  // Per-file parse status keyed by storage_path. Only used for syllabus uploads.
  const [parseStatus, setParseStatus] = useState<Record<string, ParseStatus>>({});
  // Track start time per storage_path so we can show elapsed/remaining estimate.
  const [parseStartedAt, setParseStartedAt] = useState<Record<string, number>>({});
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Estimated durations (ms) for the syllabus upload + parse pipeline.
  const UPLOAD_EST_MS = 4000;
  const PARSE_EST_MS = 25000;

  // Cascade-wipe progress state (only used when deleting the last syllabus file)
  const WIPE_STEPS: Array<{ id: string; label: string; weightMs: number }> = [
    { id: "syllabus_file", label: "Removing syllabus file", weightMs: 1000 },
    { id: "syllabus_json", label: "Clearing parsed syllabus", weightMs: 1000 },
    { id: "concepts", label: "Deleting concepts", weightMs: 2000 },
    { id: "lesson_plan", label: "Deleting lesson plan", weightMs: 2000 },
    { id: "diagnostic_questions", label: "Deleting diagnostic questions", weightMs: 2000 },
    { id: "course_flags", label: "Resetting course flags & cache", weightMs: 1000 },
    { id: "setup_progress", label: "Resetting downstream setup progress", weightMs: 1000 },
    { id: "verify", label: "Verifying all data was removed", weightMs: 800 },
  ];
  type WipeStatus = "idle" | "running" | "done" | "failed";
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeStatuses, setWipeStatuses] = useState<Record<string, WipeStatus>>({});
  const [wipeElapsed, setWipeElapsed] = useState(0);
  const [wipeFinished, setWipeFinished] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);

  // Bubble parse status to parent so it can gate Next button.
  useEffect(() => {
    onParseStatusChange?.(parseStatus);
  }, [parseStatus, onParseStatusChange]);

  // Tick `now` every 250ms while any syllabus operation is in flight, so the
  // progress bar + ETA stay live without re-rendering when nothing's happening.
  useEffect(() => {
    const anyParsing = Object.values(parseStatus).some((s) => s === "parsing");
    if (!uploading && !anyParsing && uploadStartedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [uploading, parseStatus, uploadStartedAt]);

  // On mount (and when files/courseId change), seed parseStatus to "parsed"
  // for existing syllabus files when the parsed JSON pointer is present, so a
  // page reload doesn't make Next look perpetually disabled.
  useEffect(() => {
    if (folderType !== "syllabus" || !courseId || files.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("syllabus_json_path")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.syllabus_json_path && data.syllabus_json_path.trim().length > 0) {
        setParseStatus((prev) => {
          const next = { ...prev };
          for (const f of files) if (!next[f.path]) next[f.path] = "parsed";
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [folderType, courseId, files]);

  const atCapacity = typeof maxFiles === "number" && files.length + pending.length >= maxFiles;
  const remainingSlots = typeof maxFiles === "number"
    ? Math.max(0, maxFiles - files.length - pending.length)
    : Infinity;

  const handleSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (typeof maxFiles === "number" && remainingSlots <= 0) {
      toast.error(`Only ${maxFiles} file${maxFiles === 1 ? "" : "s"} allowed. Remove the existing one first.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const valid: File[] = [];
    let dropped = 0;
    for (const file of Array.from(fileList)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10 MB limit`);
        continue;
      }
      if (valid.length >= remainingSlots) { dropped++; continue; }
      valid.push(file);
    }
    if (dropped > 0) {
      toast.error(`Only ${maxFiles} file${maxFiles === 1 ? "" : "s"} allowed; ignored ${dropped} extra.`);
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
    setParseStartedAt((prev) => ({ ...prev, [storagePath]: Date.now() }));
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

      if (teacherId) void markStepCompleted(teacherId, "upload", courseId, { source: "FileUploadZone.uploadComplete" });

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
    if (folderType === "syllabus") setUploadStartedAt(Date.now());

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

  const isLastSyllabusDelete = (file: UploadedFile) =>
    folderType === "syllabus" && !!courseId && files.filter((f) => f.path !== file.path).length === 0;

  const runCascadeWipe = async (file: UploadedFile) => {
    setWipeOpen(true);
    setWipeFinished(false);
    setWipeError(null);
    setWipeElapsed(0);
    const init: Record<string, WipeStatus> = {};
    for (const s of WIPE_STEPS) init[s.id] = "idle";
    setWipeStatuses(init);

    const startedAt = Date.now();
    const tick = setInterval(() => setWipeElapsed(Date.now() - startedAt), 200);

    // Drive predicted step progression locally on the weight timeline.
    const cumulative: Array<{ id: string; doneAt: number }> = [];
    let acc = 0;
    for (const s of WIPE_STEPS) { acc += s.weightMs; cumulative.push({ id: s.id, doneAt: acc }); }
    let currentIdx = 0;
    setWipeStatuses((prev) => ({ ...prev, [WIPE_STEPS[0].id]: "running" }));
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      while (currentIdx < cumulative.length && elapsed >= cumulative[currentIdx].doneAt) {
        const id = cumulative[currentIdx].id;
        setWipeStatuses((prev) => ({ ...prev, [id]: "done" }));
        currentIdx++;
        if (currentIdx < cumulative.length) {
          const nextId = cumulative[currentIdx].id;
          setWipeStatuses((prev) => ({ ...prev, [nextId]: "running" }));
        }
      }
    }, 150);

    try {
      const { data, error } = await supabase.functions.invoke("wipe-syllabus-cascade", {
        body: { courseId, syllabusStoragePath: file.path },
      });
      clearInterval(progressTimer);
      clearInterval(tick);

      if (error || (data && (data as any).error)) {
        const failedStep = (data as any)?.stepId as string | undefined;
        const msg = (error?.message || (data as any)?.error || "Wipe failed") as string;
        setWipeStatuses((prev) => {
          const next = { ...prev };
          if (failedStep) next[failedStep] = "failed";
          // mark earlier as done, later as idle
          let seenFailed = false;
          for (const s of WIPE_STEPS) {
            if (s.id === failedStep) { seenFailed = true; continue; }
            if (!seenFailed) next[s.id] = "done";
            else if (next[s.id] !== "failed") next[s.id] = "idle";
          }
          return next;
        });
        setWipeError(msg);
        setWipeFinished(true);
        toast.error(`Failed: ${msg}`);
        return;
      }

      // success — mark all done
      setWipeStatuses(() => {
        const next: Record<string, WipeStatus> = {};
        for (const s of WIPE_STEPS) next[s.id] = "done";
        return next;
      });
      setWipeFinished(true);

      // Update local UI state
      const remaining = files.filter((f) => f.path !== file.path);
      onFilesChange(remaining);
      setParseStatus((prev) => {
        const next = { ...prev };
        delete next[file.path];
        return next;
      });
      toast.success("Syllabus and generated data wiped");
    } catch (e: any) {
      clearInterval(progressTimer);
      clearInterval(tick);
      setWipeError(e?.message ?? "Unknown error");
      setWipeFinished(true);
      toast.error(`Failed: ${e?.message ?? "Unknown error"}`);
    }
  };

  const performSimpleDelete = async (file: UploadedFile) => {
    const { error } = await supabase.storage.from("course-materials").remove([file.path]);
    if (error) {
      toast.error(`Failed to remove ${file.name}`);
      return;
    }
    if (teacherId && folderType) {
      await supabase.from("course_material_files").delete().eq("storage_path", file.path);
    }
    const remaining = files.filter((f) => f.path !== file.path);
    onFilesChange(remaining);
    setParseStatus((prev) => {
      const next = { ...prev };
      delete next[file.path];
      return next;
    });
    toast.success(`Removed "${file.name}"`);
  };

  const performDelete = async () => {
    const file = deleteTarget;
    if (!file) return;
    setDeleteTarget(null);
    if (isLastSyllabusDelete(file)) {
      await runCascadeWipe(file);
    } else {
      await performSimpleDelete(file);
    }
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
        multiple={maxFiles !== 1}
        className="hidden"
        onChange={(e) => handleSelect(e.target.files)}
      />

      {/* Drop / select zone */}
      <div
        onClick={() => !uploading && !atCapacity && inputRef.current?.click()}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
          atCapacity ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        } ${
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
        ) : atCapacity ? (
          <>
            <Check className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary">
              {maxFiles === 1 ? "Syllabus uploaded — delete it to replace" : `Maximum of ${maxFiles} files reached`}
            </span>
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
            <span className="text-sm text-muted-foreground">
              {maxFiles === 1 ? "Click to select your syllabus file" : "Click to select files"}
            </span>
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
            {deleteTarget && isLastSyllabusDelete(deleteTarget) ? (
              <>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Delete syllabus and all generated content?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      Deleting <span className="font-medium text-foreground">{deleteTarget.name}</span> will also wipe everything generated from it:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      <li>Parsed syllabus JSON</li>
                      <li>Extracted &amp; confirmed concepts</li>
                      <li>Lesson plan weeks</li>
                      <li>Diagnostic questions &amp; assessment questions</li>
                      <li>Downstream setup step progress (concepts, lesson plan, diagnostic, AI assistant, exam mode, enrollment)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Your uploaded "Past Course Materials" are not affected.
                    </p>
                  </div>
                </AlertDialogDescription>
              </>
            ) : (
              <>
                <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This will remove it from your course materials and may affect concept mapping.
                </AlertDialogDescription>
              </>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTarget && isLastSyllabusDelete(deleteTarget) ? "Delete and wipe generated data" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cascade wipe progress */}
      <Dialog open={wipeOpen} onOpenChange={(open) => { if (!open && wipeFinished) setWipeOpen(false); }}>
        <DialogContent onInteractOutside={(e) => { if (!wipeFinished) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Wiping syllabus &amp; generated content</DialogTitle>
            <DialogDescription>
              {wipeFinished
                ? wipeError
                  ? "Some steps failed. Check the list below."
                  : "All done."
                : "Please don't close this window. This usually takes about 10 seconds."}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const totalMs = WIPE_STEPS.reduce((s, x) => s + x.weightMs, 0);
            const doneCount = WIPE_STEPS.filter((s) => wipeStatuses[s.id] === "done").length;
            const pct = Math.min(100, Math.round((doneCount / WIPE_STEPS.length) * 100));
            const remainingMs = Math.max(0, totalMs - wipeElapsed);
            return (
              <div className="space-y-3">
                <Progress value={wipeFinished ? 100 : pct} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{wipeFinished ? "Complete" : `~${Math.ceil(remainingMs / 1000)}s remaining`}</span>
                  <span>{doneCount}/{WIPE_STEPS.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {WIPE_STEPS.map((s) => {
                    const st = wipeStatuses[s.id] ?? "idle";
                    return (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        {st === "done" && <Check className="h-4 w-4 text-primary" />}
                        {st === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        {st === "failed" && <X className="h-4 w-4 text-destructive" />}
                        {st === "idle" && <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />}
                        <span className={st === "failed" ? "text-destructive" : st === "idle" ? "text-muted-foreground" : ""}>
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {wipeError && (
                  <p className="text-xs text-destructive">{wipeError}</p>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWipeOpen(false)}
              disabled={!wipeFinished}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileUploadZone;
