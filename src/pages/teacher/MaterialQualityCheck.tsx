import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Download,
  Pencil,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";

interface MaterialIssue {
  id: string;
  materialName: string;
  materialType: "slides" | "document" | "exam" | "plan";
  location: string;
  original: string;
  correction: string;
  reason: string;
  severity: "error" | "warning" | "suggestion";
  status: "pending" | "approved" | "edited" | "dismissed";
  editedCorrection?: string;
}

const mockIssues: MaterialIssue[] = [
  {
    id: "mi1",
    materialName: "Week 3 — Memory Management Slides.pptx",
    materialType: "slides",
    location: "Slide 12, Bullet 3",
    original: "LRU replaces the page that was least frequently used",
    correction: "LRU replaces the page that was least recently used (not least frequently — that is LFU)",
    reason: "Conflation of LRU (Least Recently Used) and LFU (Least Frequently Used) algorithms. These are distinct replacement strategies.",
    severity: "error",
    status: "pending",
  },
  {
    id: "mi2",
    materialName: "Week 5 — Synchronization Notes.docx",
    materialType: "document",
    location: "Section 2.3, Paragraph 1",
    original: "A semaphore can only take values 0 and 1",
    correction: "A binary semaphore can only take values 0 and 1. A counting semaphore can take any non-negative integer value.",
    reason: "The statement is only true for binary semaphores, not semaphores in general. This distinction is critical for students.",
    severity: "error",
    status: "pending",
  },
  {
    id: "mi3",
    materialName: "Week 3 — Memory Management Slides.pptx",
    materialType: "slides",
    location: "Slide 18, Diagram",
    original: "Page table entry size shown as 16 bits",
    correction: "Page table entry size should be at least 20 bits for a 32-bit address space with 4KB pages (20-bit frame number + control bits)",
    reason: "The diagram understates PTE size which could confuse students during exam calculations.",
    severity: "warning",
    status: "pending",
  },
  {
    id: "mi4",
    materialName: "Midterm Exam — Draft.pdf",
    materialType: "exam",
    location: "Question 7, Option C",
    original: "FIFO always performs worse than LRU",
    correction: "FIFO does not always perform worse than LRU — Bélády's anomaly shows FIFO can behave unpredictably, but there are cases where FIFO matches or exceeds LRU.",
    reason: "This is a common misconception. The answer key marks this as correct, which would penalise students who understand the nuance.",
    severity: "error",
    status: "pending",
  },
  {
    id: "mi5",
    materialName: "Week 1 — Process Management Slides.pptx",
    materialType: "slides",
    location: "Slide 7, Title",
    original: "Kernal Mode vs User Mode",
    correction: "Kernel Mode vs User Mode",
    reason: "Spelling error: 'Kernal' should be 'Kernel'.",
    severity: "suggestion",
    status: "pending",
  },
];

const severityConfig = {
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/30" },
  warning: { label: "Warning", className: "bg-warning/10 text-warning border-warning/30" },
  suggestion: { label: "Suggestion", className: "bg-primary/10 text-primary border-primary/30" },
};

const MaterialQualityCheck = () => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<MaterialIssue[]>(mockIssues);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(true);

  const pendingCount = issues.filter((i) => i.status === "pending").length;
  const resolvedCount = issues.filter((i) => i.status !== "pending").length;
  const allResolved = pendingCount === 0;

  const handleApprove = (id: string) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: "approved" } : i)));
    setExpandedId(null);
    setEditingId(null);
  };

  const handleDismiss = (id: string) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: "dismissed" } : i)));
    setExpandedId(null);
    setEditingId(null);
  };

  const handleStartEdit = (issue: MaterialIssue) => {
    setEditingId(issue.id);
    setEditText(issue.editedCorrection || issue.correction);
  };

  const handleSaveEdit = (id: string) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "edited", editedCorrection: editText } : i))
    );
    setEditingId(null);
    setExpandedId(null);
  };

  const handleUndo = (id: string) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "pending", editedCorrection: undefined } : i))
    );
  };

  const handleRescan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanComplete(true);
    }, 2000);
  };

  const groupedByMaterial = issues.reduce<Record<string, MaterialIssue[]>>((acc, issue) => {
    if (!acc[issue.materialName]) acc[issue.materialName] = [];
    acc[issue.materialName].push(issue);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <SetupProgressBar currentStep={2} />
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Material Quality <span className="text-primary">Check</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            AI has scanned your uploaded materials for accuracy. Review flagged issues below.
          </p>
        </div>

        {/* Summary Bar */}
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRescan} disabled={scanning}>
                {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Re-scan
              </Button>
              {allResolved && (
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> Download Corrected Materials
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Issues grouped by material */}
        <div className="space-y-6">
          {Object.entries(groupedByMaterial).map(([materialName, materialIssues]) => (
            <Card key={materialName}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{materialName}</CardTitle>
                    <CardDescription>
                      {materialIssues.length} issue{materialIssues.length !== 1 ? "s" : ""} found
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {materialIssues.map((issue) => {
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
                      {/* Row header */}
                      <div
                        className="flex cursor-pointer items-start justify-between gap-3"
                        onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={sev.className}>
                              {sev.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{issue.location}</span>
                            {resolved && (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                {issue.status === "approved"
                                  ? "Approved"
                                  : issue.status === "edited"
                                  ? "Edited"
                                  : "Dismissed"}
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

                      {/* Expanded detail */}
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

                            {/* Actions */}
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
              </CardContent>
            </Card>
          ))}
        </div>

        {/* All-clear state */}
        {allResolved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center gap-4 p-5">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">All issues resolved</p>
                  <p className="text-sm text-muted-foreground">
                    Your corrected materials are ready to download. The teaching plan will reflect these changes.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> Download All
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" onClick={() => navigate("/teacher/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => navigate("/teacher/setup/syllabus")} disabled={!allResolved}>
            Continue to Teaching Plan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MaterialQualityCheck;
