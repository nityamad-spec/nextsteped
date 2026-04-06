import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Pencil,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookOpen,
  Calendar,
  GraduationCap,
  ClipboardList,
  ScrollText,
  Library,
  Trash2,
  Plus,
  Save,
  X,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import FileUploadZone from "@/components/FileUploadZone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────

interface UploadedFile {
  name: string;
  size: number;
  path: string;
}

interface SyllabusJson {
  courseTitle: string;
  courseCode: string;
  instructor: string;
  term: string;
  description: string;
  learningObjectives: string[];
  schedule: { week: number; topic: string; description: string; readings: string }[];
  gradingPolicy: { components: { name: string; weight: string; description: string }[] };
  policies: { title: string; content: string }[];
  resources: string[];
}

interface QualityIssue {
  id: string;
  jsonPath: string;
  original: string;
  correction: string;
  reason: string;
  severity: "error" | "warning" | "suggestion";
  status: "pending" | "approved" | "edited" | "dismissed";
  editedCorrection?: string;
}

type PipelineStage = "idle" | "loading" | "parsing" | "checking" | "review" | "preview" | "saving" | "error";

const UPLOAD_ACCEPT = ".pdf,.pptx,.docx,.txt,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp";

const severityConfig = {
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/30" },
  warning: { label: "Warning", className: "bg-warning/10 text-warning border-warning/30" },
  suggestion: { label: "Suggestion", className: "bg-primary/10 text-primary border-primary/30" },
};

// ── Helpers ────────────────────────────────────────────────────────

function getByPath(obj: any, path: string): any {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setByPath(obj: any, path: string, value: any): any {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  if (keys.length === 1) {
    (clone as any)[keys[0]] = value;
    return clone;
  }
  const [first, ...rest] = keys;
  (clone as any)[first] = setByPath((clone as any)[first], rest.join("."), value);
  return clone;
}

// ── Component ──────────────────────────────────────────────────────

const MaterialQualityCheck = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const courseId = (location.state as any)?.courseId || localStorage.getItem("currentCourseId");

  const [stage, setStage] = useState<PipelineStage>("idle");
  const [syllabusFiles, setSyllabusFiles] = useState<UploadedFile[]>([]);
  const [stageMessage, setStageMessage] = useState("Preparing…");
  const [syllabusJson, setSyllabusJson] = useState<SyllabusJson | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [finalApproved, setFinalApproved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewJson, setPreviewJson] = useState<SyllabusJson | null>(null);

  const pendingCount = issues.filter((i) => i.status === "pending").length;
  const resolvedCount = issues.filter((i) => i.status !== "pending").length;
  const allResolved = issues.length > 0 && pendingCount === 0;

  // ── Load existing uploaded files on mount ───────────────────────

  useEffect(() => {
    const fetchFiles = async () => {
      if (!user) return;
      let query = supabase
        .from("course_material_files")
        .select("file_name, file_size, storage_path")
        .eq("teacher_id", user.id)
        .eq("folder_type", "syllabus");
      if (courseId) query = query.eq("course_id", courseId);
      const { data } = await query;
      if (data) {
        setSyllabusFiles(
          data.map((f) => ({ name: f.file_name, size: f.file_size, path: f.storage_path }))
        );
      }
    };
    fetchFiles();
  }, [user, courseId]);

  // ── Load existing approved syllabus JSON on mount ───────────────
  useEffect(() => {
    const loadApproved = async () => {
      if (!user) return;
      const { data: blob, error } = await supabase.storage
        .from("course-materials")
        .download(`${user.id}/syllabus/approved-syllabus.json`);
      if (!error && blob) {
        try {
          const text = await blob.text();
          const json = JSON.parse(text) as SyllabusJson;
          setPreviewJson(json);
          setFinalApproved(true);
        } catch (e) {
          console.warn("Failed to parse existing approved syllabus:", e);
        }
      }
    };
    loadApproved();
  }, [user]);

  // ── Pipeline: fetch → parse → check ─────────────────────────────

  const runPipeline = useCallback(async () => {
    if (!user) return;

    try {
      let parsed: SyllabusJson;

      // Try loading existing approved JSON first (skip PDF re-conversion)
      setStage("loading");
      setStageMessage("Checking for existing syllabus data…");

      const { data: existingBlob, error: existingErr } = await supabase.storage
        .from("course-materials")
        .download(`${user.id}/syllabus/approved-syllabus.json`);

      if (!existingErr && existingBlob) {
        setStageMessage("Loading saved syllabus…");
        const jsonText = await existingBlob.text();
        parsed = JSON.parse(jsonText) as SyllabusJson;
        setSyllabusJson(parsed);
      } else {
        setStageMessage("Fetching your syllabus files…");

        const { data: files, error: filesErr } = await supabase
          .from("course_material_files")
          .select("file_name, storage_path")
          .eq("teacher_id", user.id)
          .eq("folder_type", "syllabus");

        if (filesErr) throw new Error(filesErr.message);
        if (!files || files.length === 0) {
          setErrorMsg("No syllabus files found. Please upload your syllabus first.");
          setStage("error");
          return;
        }

        const file = files[0];
        const { data: blob, error: dlErr } = await supabase.storage
          .from("course-materials")
          .download(file.storage_path);

        if (dlErr || !blob) throw new Error(dlErr?.message || "Failed to download file");

        const fileContent = await blob.text();

        setStage("parsing");
        setStageMessage("AI is analyzing your syllabus and extracting structured content…");

        const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-syllabus", {
          body: { fileContent, fileName: file.file_name },
        });

        if (parseError) throw new Error(parseError.message);
        if (parseData?.error) throw new Error(parseData.error);
        if (!parseData?.syllabus) throw new Error("Failed to parse syllabus — no structured data returned.");

        parsed = parseData.syllabus;
        setSyllabusJson(parsed);
      }

      // Quality check
      setStage("checking");
      setStageMessage("AI is reviewing for errors, inconsistencies, and improvements…");

      const { data: checkData, error: checkError } = await supabase.functions.invoke("quality-check", {
        body: { syllabusJson: parsed },
      });

      if (checkError) throw new Error(checkError.message);
      if (checkData?.error) throw new Error(checkData.error);

      const rawIssues: QualityIssue[] = (checkData?.issues || []).map(
        (issue: any, idx: number) => ({
          ...issue,
          id: `qi-${idx}`,
          status: "pending" as const,
        })
      );

      setIssues(rawIssues);

      if (rawIssues.length === 0) {
        setStage("preview");
      } else {
        setStage("review");
      }
    } catch (err: any) {
      console.error("Pipeline error:", err);
      setErrorMsg(err.message || "An unexpected error occurred.");
      setStage("error");
    }
  }, [user]);

  // ── Issue actions ────────────────────────────────────────────────

  const applyCorrection = (issue: QualityIssue, correctionText: string) => {
    if (!syllabusJson) return;
    setSyllabusJson(setByPath(syllabusJson, issue.jsonPath, correctionText));
  };

  const handleApprove = (id: string) => {
    const issue = issues.find((i) => i.id === id);
    if (issue) applyCorrection(issue, issue.correction);
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: "approved" } : i)));
    setExpandedId(null);
    setEditingId(null);
  };

  const handleDismiss = (id: string) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: "dismissed" } : i)));
    setExpandedId(null);
    setEditingId(null);
  };

  const handleStartEdit = (issue: QualityIssue) => {
    setEditingId(issue.id);
    setEditText(issue.editedCorrection || issue.correction);
  };

  const handleSaveEdit = (id: string) => {
    const issue = issues.find((i) => i.id === id);
    if (issue) applyCorrection(issue, editText);
    setIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "edited", editedCorrection: editText } : i))
    );
    setEditingId(null);
    setExpandedId(null);
  };

  const handleUndo = (id: string) => {
    const issue = issues.find((i) => i.id === id);
    if (issue && syllabusJson) {
      setSyllabusJson(setByPath(syllabusJson, issue.jsonPath, issue.original));
    }
    setIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "pending", editedCorrection: undefined } : i))
    );
  };

  // Removed auto-advance: professors must click a button to move to preview stage

  // ── Save final JSON ─────────────────────────────────────────────

  const handleApproveAndSave = async () => {
    if (!user || !syllabusJson) return;
    setStage("saving");
    setStageMessage("Saving your approved syllabus…");

    try {
      const storagePath = `${user.id}/syllabus/approved-syllabus.json`;
      const jsonBlob = new Blob([JSON.stringify(syllabusJson, null, 2)], { type: "application/json" });

      const { error: uploadErr } = await supabase.storage
        .from("course-materials")
        .upload(storagePath, jsonBlob, { upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      const updateQuery = courseId
        ? supabase.from("courses").update({ syllabus_json_path: storagePath, syllabus_uploaded: true } as any).eq("id", courseId)
        : supabase.from("courses").update({ syllabus_json_path: storagePath, syllabus_uploaded: true } as any).eq("teacher_id", user.id);
      const { error: updateErr } = await updateQuery;

      if (updateErr) {
        console.warn("Could not update course with syllabus path:", updateErr.message);
      }

      // Backfill course_id on uploaded files
      if (courseId) {
        const paths = syllabusFiles.map((f) => f.path);
        if (paths.length > 0) {
          await supabase
            .from("course_material_files")
            .update({ course_id: courseId })
            .in("storage_path", paths);
        }
      }

      setStage("preview");
      setFinalApproved(true);
      toast({ title: "Syllabus saved", description: "Your approved syllabus has been stored successfully." });
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
      setStage("preview");
    }
  };

  // ── Render: Idle state — upload + Review button ──────────────────

  if (stage === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-3xl">
          <SetupProgressBar currentStep={2} />

          <div className="mb-8 text-center">
            <h1 className="font-heading text-3xl font-bold">
              Syllabus <span className="text-primary">Review</span>
            </h1>
            <p className="mt-2 text-muted-foreground">
              Upload your syllabus and AICTE guidelines, then review with AI-powered analysis.
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" /> Upload Syllabus & AICTE Guidelines
              </CardTitle>
              <CardDescription>
                Upload your course syllabus and any AICTE guidelines documents. These will be parsed and analyzed by AI for quality and consistency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                <strong>Recommended:</strong> PDF, PPTX, DOCX for best results. Scans/images may reduce accuracy.
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images (PNG, JPG, JPEG, GIF, BMP, WEBP).
              </p>
              {user ? (
                <FileUploadZone
                  folderPath={`${user.id}/syllabus`}
                  accept={UPLOAD_ACCEPT}
                  files={syllabusFiles}
                  onFilesChange={setSyllabusFiles}
                  teacherId={user.id}
                  folderType="syllabus"
                  courseId={courseId}
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                  Preparing upload area…
                </div>
              )}
            </CardContent>
          </Card>

          {previewJson && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" /> Previously Approved Syllabus
                </CardTitle>
                <CardDescription>
                  Your syllabus was previously reviewed and approved. You can continue or re-upload and re-review if needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SyllabusPreview syllabus={previewJson} editable onChange={setPreviewJson} />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={async () => {
                      if (!user || !previewJson) return;
                      const blob = new Blob([JSON.stringify(previewJson, null, 2)], { type: "application/json" });
                      const { error } = await supabase.storage.from("course-materials").upload(`${user.id}/syllabus/approved-syllabus.json`, blob, { upsert: true });
                      if (error) {
                        toast({ title: "Save failed", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Changes saved", description: "Your syllabus edits have been saved." });
                      }
                    }}
                  >
                    <Save className="h-3.5 w-3.5" /> Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center gap-3 flex-wrap">
            <Button variant="outline" onClick={() => navigate("/teacher/onboarding")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
            {previewJson && (
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(previewJson, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `syllabus-${previewJson.courseCode || "export"}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "Syllabus downloaded" });
                }}
              >
                <FileText className="mr-2 h-4 w-4" /> Download Syllabus
              </Button>
            )}
            <Button
              onClick={runPipeline}
              disabled={syllabusFiles.length === 0}
              size="lg"
              variant={previewJson ? "outline" : "default"}
            >
              <BookOpen className="mr-2 h-4 w-4" /> {previewJson ? "Re-Review Syllabus" : "Review Syllabus"}
            </Button>
            {previewJson && (
              <Button
                size="lg"
                onClick={() => navigate("/teacher/setup/lesson-plan", { state: { courseId } })}
              >
                Continue to Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Loading / Parsing / Checking states ──────────────────

  if (stage === "loading" || stage === "parsing" || stage === "checking" || stage === "saving") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-3xl">
          <SetupProgressBar currentStep={2} />
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <h2 className="font-heading text-xl font-semibold">{stageMessage}</h2>
            <p className="text-sm text-muted-foreground">This may take a minute — AI is working on your syllabus.</p>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-3xl">
          <SetupProgressBar currentStep={2} />
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h2 className="font-heading text-xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStage("idle")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
              </Button>
              <Button onClick={() => { setStage("loading"); runPipeline(); }}>
                <RotateCcw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Review issues / Preview ──────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <SetupProgressBar currentStep={2} />

        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Syllabus <span className="text-primary">Review</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            {stage === "preview"
              ? "Review your final syllabus below and approve to save."
              : "AI has reviewed your syllabus. Resolve flagged issues below."}
          </p>
        </div>

        {/* Review Issues Section */}
        {stage === "review" && (
          <>
            <Card className="mb-6">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">{pendingCount} pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{resolvedCount} resolved</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {issues.map((issue) => {
                const isExpanded = expandedId === issue.id;
                const isEditing = editingId === issue.id;
                const sev = severityConfig[issue.severity];
                const resolved = issue.status !== "pending";

                return (
                  <motion.div
                    key={issue.id}
                    layout
                    className={`rounded-lg border p-4 transition-colors ${
                      resolved ? "border-muted bg-muted/30 opacity-75" : "border-border"
                    }`}
                  >
                    <div
                      className="flex cursor-pointer items-start justify-between gap-3"
                      onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={sev.className}>{sev.label}</Badge>
                          <span className="text-xs text-muted-foreground font-mono">{issue.jsonPath}</span>
                          {resolved && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              {issue.status === "approved" ? "Approved" : issue.status === "edited" ? "Edited" : "Dismissed"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm leading-snug">
                          <span className="font-medium text-destructive line-through">{issue.original}</span>
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 space-y-3 overflow-hidden"
                        >
                          <div className="rounded-md bg-primary/5 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                              Suggested Correction
                            </p>
                            {isEditing ? (
                              <Textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="mt-1"
                                rows={3}
                              />
                            ) : (
                              <p className="text-sm">{issue.editedCorrection || issue.correction}</p>
                            )}
                          </div>

                          <div className="rounded-md bg-muted/50 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Why this was flagged
                            </p>
                            <p className="text-sm text-muted-foreground">{issue.reason}</p>
                          </div>

                          {!resolved ? (
                            <div className="flex flex-wrap gap-2">
                              {isEditing ? (
                                <>
                                  <Button size="sm" onClick={() => handleSaveEdit(issue.id)}>
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Save & Approve
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button size="sm" onClick={() => handleApprove(issue.id)}>
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve Correction
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handleStartEdit(issue)}>
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Correction
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDismiss(issue.id)}>
                                    Dismiss
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => handleUndo(issue.id)}>
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Undo
                            </Button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            {/* Manual advance to preview when all resolved */}
            {allResolved && (
              <div className="mt-6 flex justify-center">
                <Button size="lg" onClick={() => setStage("preview")} className="gap-2">
                  <CheckCircle2 className="h-5 w-5" /> All Issues Resolved — Continue to Preview
                </Button>
              </div>
            )}
          </>
        )}

        {/* Final Preview Section */}
        {(stage === "preview") && syllabusJson && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {issues.length > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex items-center gap-4 p-5">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">All issues resolved</p>
                    <p className="text-sm text-muted-foreground">
                      Review your corrected syllabus below and approve to save.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <SyllabusPreview syllabus={syllabusJson} editable onChange={setSyllabusJson} />

            {!finalApproved ? (
              <div className="flex justify-center">
                <Button size="lg" onClick={handleApproveAndSave}>
                  <ShieldCheck className="mr-2 h-5 w-5" /> Approve & Save Syllabus
                </Button>
              </div>
            ) : (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex items-center gap-4 p-5">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Syllabus approved and saved</p>
                    <p className="text-sm text-muted-foreground">Continue to the next step.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" onClick={() => navigate("/teacher/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => navigate("/teacher/setup/lesson-plan", { state: { courseId } })} disabled={!finalApproved}>
            Continue to Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Syllabus Preview Sub-Component ─────────────────────────────────

function SyllabusPreview({
  syllabus,
  editable = false,
  onChange,
}: {
  syllabus: SyllabusJson;
  editable?: boolean;
  onChange?: (updated: SyllabusJson) => void;
}) {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);

  const startEdit = (section: string, value: any) => {
    setEditingSection(section);
    setDraft(JSON.parse(JSON.stringify(value)));
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setDraft(null);
  };

  const saveEdit = (section: string) => {
    if (!onChange) return;
    const updated = { ...syllabus };
    switch (section) {
      case "header":
        updated.courseTitle = draft.courseTitle;
        updated.courseCode = draft.courseCode;
        updated.instructor = draft.instructor;
        updated.term = draft.term;
        break;
      case "description":
        updated.description = draft;
        break;
      case "objectives":
        updated.learningObjectives = draft;
        break;
      case "schedule":
        updated.schedule = draft;
        break;
      case "grading":
        updated.gradingPolicy = { components: draft };
        break;
      case "policies":
        updated.policies = draft;
        break;
      case "resources":
        updated.resources = draft;
        break;
    }
    onChange(updated);
    setEditingSection(null);
    setDraft(null);
  };

  const SectionHeader = ({ icon: Icon, label, section, value }: { icon: any; label: string; section: string; value: any }) => (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </h3>
      {editable && editingSection !== section && (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => startEdit(section, value)}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      )}
      {editingSection === section && (
        <div className="flex gap-1">
          <Button variant="default" size="sm" className="h-7 gap-1 text-xs" onClick={() => saveEdit(section)}>
            <Save className="h-3 w-3" /> Save
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={cancelEdit}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        {editingSection === "header" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Edit Header</span>
              <div className="flex gap-1">
                <Button variant="default" size="sm" className="h-7 gap-1 text-xs" onClick={() => saveEdit("header")}>
                  <Save className="h-3 w-3" /> Save
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={cancelEdit}>
                  <X className="h-3 w-3" /> Cancel
                </Button>
              </div>
            </div>
            <Input placeholder="Course Title" value={draft.courseTitle} onChange={(e) => setDraft({ ...draft, courseTitle: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Course Code" value={draft.courseCode} onChange={(e) => setDraft({ ...draft, courseCode: e.target.value })} />
              <Input placeholder="Term" value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} />
              <Input placeholder="Instructor" value={draft.instructor} onChange={(e) => setDraft({ ...draft, instructor: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {syllabus.courseTitle || "Untitled Course"}
              </CardTitle>
              <CardDescription>
                {[syllabus.courseCode, syllabus.term, syllabus.instructor].filter(Boolean).join(" • ")}
              </CardDescription>
            </div>
            {editable && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => startEdit("header", { courseTitle: syllabus.courseTitle, courseCode: syllabus.courseCode, instructor: syllabus.instructor, term: syllabus.term })}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Description */}
        {(syllabus.description || editingSection === "description") && (
          <section>
            <SectionHeader icon={BookOpen} label="Course Description" section="description" value={syllabus.description} />
            {editingSection === "description" ? (
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
            ) : (
              <p className="text-sm leading-relaxed">{syllabus.description}</p>
            )}
          </section>
        )}

        {/* Learning Objectives */}
        {(syllabus.learningObjectives?.length > 0 || editingSection === "objectives") && (
          <section>
            <SectionHeader icon={GraduationCap} label="Learning Objectives" section="objectives" value={syllabus.learningObjectives} />
            {editingSection === "objectives" ? (
              <div className="space-y-2">
                {(draft as string[]).map((obj: string, i: number) => (
                  <div key={i} className="flex gap-2">
                    <Input value={obj} onChange={(e) => { const d = [...draft]; d[i] = e.target.value; setDraft(d); }} />
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setDraft(draft.filter((_: any, j: number) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft([...draft, ""])}>
                  <Plus className="h-3 w-3" /> Add Objective
                </Button>
              </div>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {syllabus.learningObjectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Schedule */}
        {(syllabus.schedule?.length > 0 || editingSection === "schedule") && (
          <section>
            <SectionHeader icon={Calendar} label="Weekly Schedule" section="schedule" value={syllabus.schedule} />
            {editingSection === "schedule" ? (
              <div className="space-y-2">
                {(draft as SyllabusJson["schedule"]).map((entry, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input className="w-16" placeholder="Wk" value={String(entry.week)} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], week: Number(e.target.value) || 0 }; setDraft(d); }} />
                    <Input placeholder="Topic" value={entry.topic} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], topic: e.target.value }; setDraft(d); }} />
                    <Input placeholder="Description" value={entry.description} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], description: e.target.value }; setDraft(d); }} />
                    <Input placeholder="Readings" value={entry.readings} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], readings: e.target.value }; setDraft(d); }} />
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setDraft(draft.filter((_: any, j: number) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft([...draft, { week: draft.length + 1, topic: "", description: "", readings: "" }])}>
                  <Plus className="h-3 w-3" /> Add Week
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Week</th>
                      <th className="px-3 py-2 text-left font-medium">Topic</th>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-left font-medium">Readings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syllabus.schedule.map((entry, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{entry.week}</td>
                        <td className="px-3 py-2">{entry.topic}</td>
                        <td className="px-3 py-2 text-muted-foreground">{entry.description}</td>
                        <td className="px-3 py-2 text-muted-foreground">{entry.readings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Grading Policy */}
        {(syllabus.gradingPolicy?.components?.length > 0 || editingSection === "grading") && (
          <section>
            <SectionHeader icon={ClipboardList} label="Grading Policy" section="grading" value={syllabus.gradingPolicy?.components} />
            {editingSection === "grading" ? (
              <div className="space-y-2">
                {(draft as SyllabusJson["gradingPolicy"]["components"]).map((comp, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="Component" value={comp.name} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], name: e.target.value }; setDraft(d); }} />
                    <Input className="w-24" placeholder="Weight" value={comp.weight} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], weight: e.target.value }; setDraft(d); }} />
                    <Input placeholder="Description" value={comp.description} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], description: e.target.value }; setDraft(d); }} />
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setDraft(draft.filter((_: any, j: number) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft([...draft, { name: "", weight: "", description: "" }])}>
                  <Plus className="h-3 w-3" /> Add Component
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {syllabus.gradingPolicy.components.map((comp, i) => (
                  <div key={i} className="flex items-baseline justify-between rounded-md bg-muted/30 px-3 py-2">
                    <div>
                      <span className="font-medium">{comp.name}</span>
                      {comp.description && <span className="ml-2 text-muted-foreground">— {comp.description}</span>}
                    </div>
                    <Badge variant="secondary">{comp.weight}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Policies */}
        {(syllabus.policies?.length > 0 || editingSection === "policies") && (
          <section>
            <SectionHeader icon={ScrollText} label="Policies" section="policies" value={syllabus.policies} />
            {editingSection === "policies" ? (
              <div className="space-y-3">
                {(draft as SyllabusJson["policies"]).map((policy, i) => (
                  <div key={i} className="space-y-1 rounded-md border p-3">
                    <div className="flex gap-2 items-center">
                      <Input placeholder="Policy Title" value={policy.title} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], title: e.target.value }; setDraft(d); }} />
                      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setDraft(draft.filter((_: any, j: number) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Textarea placeholder="Policy Content" value={policy.content} onChange={(e) => { const d = [...draft]; d[i] = { ...d[i], content: e.target.value }; setDraft(d); }} rows={2} />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft([...draft, { title: "", content: "" }])}>
                  <Plus className="h-3 w-3" /> Add Policy
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {syllabus.policies.map((policy, i) => (
                  <div key={i}>
                    <p className="font-medium">{policy.title}</p>
                    <p className="text-sm text-muted-foreground">{policy.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Resources */}
        {(Array.isArray(syllabus.resources) && syllabus.resources.length > 0 || editingSection === "resources") && (
          <section>
            <SectionHeader icon={Library} label="Resources" section="resources" value={syllabus.resources} />
            {editingSection === "resources" ? (
              <div className="space-y-2">
                {(draft as string[]).map((res: string, i: number) => (
                  <div key={i} className="flex gap-2">
                    <Input value={res} onChange={(e) => { const d = [...draft]; d[i] = e.target.value; setDraft(d); }} />
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setDraft(draft.filter((_: any, j: number) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft([...draft, ""])}>
                  <Plus className="h-3 w-3" /> Add Resource
                </Button>
              </div>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {syllabus.resources.map((res, i) => (
                  <li key={i}>{typeof res === 'string' ? res : JSON.stringify(res)}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default MaterialQualityCheck;
