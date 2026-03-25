import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Check, X, ArrowRight, ArrowLeft, Sparkles, Loader2,
  ChevronDown, ChevronUp, ThumbsUp, Download, Pencil, GripVertical,
  BookOpen, Newspaper, Plus, Trash2, Undo2, FileText, FileDown,
  FlaskConical, LibraryBig, ExternalLink, Lock, Unlock,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import FileUploadZone from "@/components/FileUploadZone";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Resource = {
  id: string;
  title: string;
  action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video";
  source?: string;
  accepted: boolean | null;
  provenance?: "uploads" | "web" | "instructor";
};

type DayPlan = {
  id: string;
  day: number;
  dates: string;
  topic: string;
  resources: Resource[];
  weightage: number;
  locked: boolean;
};

const typeLabels: Record<string, string> = {
  textbook: "Textbook", exercise: "Interactive Exercise", lab: "Interactive Exercise",
  tool: "Interactive Exercise", "case-study": "Case Study", article: "Article & Industry Context",
  news: "Article & Industry Context", video: "Video",
};

const typeColors: Record<string, string> = {
  textbook: "bg-secondary text-secondary-foreground", exercise: "bg-primary/10 text-primary",
  lab: "bg-primary/10 text-primary", tool: "bg-primary/10 text-primary",
  "case-study": "bg-accent/20 text-accent-foreground", article: "bg-muted text-muted-foreground",
  news: "bg-muted text-muted-foreground", video: "bg-destructive/10 text-destructive",
};

const provenanceLabels: Record<string, { label: string; className: string }> = {
  uploads: { label: "From uploads", className: "bg-primary/10 text-primary border-primary/20" },
  web: { label: "From web", className: "bg-accent/10 text-accent-foreground border-accent/20" },
  instructor: { label: "Instructor added", className: "bg-secondary text-secondary-foreground border-secondary" },
};

const UPLOAD_ACCEPT = ".pdf,.pptx,.docx,.txt,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp";

interface UploadedFile {
  name: string;
  size: number;
  path: string;
}

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const initialPlan: DayPlan[] = [
  { id: "d1", day: 1, dates: "Day 1", topic: "Python Fundamentals: Variables, Data Types & Control Flow", weightage: 30, locked: true, resources: [
    { id: "r1", title: "Intro to Python Slides", action: "Cover variables, data types, operators, and basic I/O", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r2", title: "Python Setup Guide", action: "Help students install Python and set up their IDE", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r4", title: "Interactive Coding Exercise", action: "Practice variables and data types in live coding session", type: "exercise", accepted: true, provenance: "uploads" },
    { id: "r5", title: "Real-World Python Use Cases", action: "Article showing how Python is used in industry — helpful context for Day 1", type: "article", source: "Real Python", accepted: null, provenance: "web" },
  ]},
  { id: "d2", day: 2, dates: "Day 2", topic: "Functions, Lists & Dictionaries", weightage: 40, locked: false, resources: [
    { id: "r3", title: "Functions & Data Structures Slides", action: "Cover function definitions, parameters, return values, lists, and dictionaries", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r6", title: "Calculator Lab", action: "Build a calculator using functions", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r11", title: "List Comprehension Exercise", action: "Hands-on practice with list comprehensions and dictionary operations", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r12", title: "Python Data Structures Best Practices", action: "Article on efficient use of lists and dicts — useful background reading", type: "article", source: "Medium", accepted: null, provenance: "web" },
  ]},
  { id: "d3", day: 3, dates: "Day 3", topic: "File Handling, OOP Basics & Review", weightage: 30, locked: false, resources: [
    { id: "r18", title: "OOP & File Handling Slides", action: "Cover classes, objects, file reading/writing", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r21", title: "File Organizer Project", action: "Build a simple file organizer script", type: "exercise", accepted: true, provenance: "uploads" },
    { id: "r16", title: "Workshop Review Sheet", action: "Comprehensive review covering all workshop topics", type: "textbook", accepted: true, provenance: "uploads" },
  ]},
];

const replacementPool: Omit<Resource, "id">[] = [
  { title: "Python Debugging Tips & Tricks", action: "Article on common debugging strategies for beginners", type: "article", accepted: null, provenance: "web" },
  { title: "Interactive Python Tutor", action: "Visual tool to step through code execution", type: "exercise", accepted: null, provenance: "web" },
  { title: "Python Style Guide (PEP 8)", action: "Reference guide for writing clean Python code", type: "article", source: "python.org", accepted: null, provenance: "web" },
];

const CourseCreation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const courseId = (location.state as any)?.courseId || localStorage.getItem("currentCourseId");
  const [phase, setPhase] = useState<"upload" | "generating" | "plan">("upload");
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [materialsFiles, setMaterialsFiles] = useState<UploadedFile[]>([]);
  const [genStep, setGenStep] = useState(0);
  const [genElapsed, setGenElapsed] = useState(0);
  const [days, setDays] = useState<DayPlan[]>(initialPlan);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [replacementIdx, setReplacementIdx] = useState(0);
  const [undoStack, setUndoStack] = useState<{ dayId: string; replacementId: string; resource: Resource }[]>([]);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ days: false, resources: false });
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ dayId: string; resourceId: string; title: string } | null>(null);

  const totalWeightage = days.reduce((sum, d) => sum + (d.weightage || 0), 0);

  // Load existing uploaded files on mount
  useEffect(() => {
    const fetchFiles = async () => {
      if (!user) return;
      let query = supabase
        .from("course_material_files")
        .select("file_name, file_size, storage_path, folder_type")
        .eq("teacher_id", user.id);
      if (courseId) query = query.eq("course_id", courseId);
      const { data } = await query;
      if (data) {
        const mapFile = (f: { file_name: string; file_size: number; storage_path: string }) => ({
          name: f.file_name, size: f.file_size, path: f.storage_path,
        });
        setLessonPlanFiles(data.filter((f) => f.folder_type === "lesson-plans").map(mapFile));
        setMaterialsFiles(data.filter((f) => f.folder_type === "materials").map(mapFile));
      }
    };
    fetchFiles();
  }, [user, courseId]);

  const handleStartGeneration = async () => {
    // Backfill course_id on uploaded files
    if (courseId && user) {
      const allPaths = [...lessonPlanFiles.map((f) => f.path), ...materialsFiles.map((f) => f.path)];
      if (allPaths.length > 0) {
        await supabase
          .from("course_material_files")
          .update({ course_id: courseId })
          .in("storage_path", allPaths);
      }
      // Update course materials_uploaded flag
      await supabase.from("courses").update({ materials_uploaded: materialsFiles.length > 0 } as any).eq("id", courseId);
    }
    setPhase("generating");
  };

  useEffect(() => {
    if (phase !== "generating") return;
    const stepTimer = setInterval(() => {
      setGenStep((s) => {
        if (s >= 2) { clearInterval(stepTimer); setTimeout(() => setPhase("plan"), 800); return s; }
        return s + 1;
      });
    }, 1200);
    const elapsedTimer = setInterval(() => setGenElapsed((e) => e + 1), 1000);
    return () => { clearInterval(stepTimer); clearInterval(elapsedTimer); };
  }, [phase]);

  const updateWeightage = (dayId: string, value: number) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, weightage: Math.max(0, value) } : d));
    setPublished(false);
  };

  const toggleLock = (dayId: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, locked: !d.locked } : d));
    const day = days.find(d => d.id === dayId);
    toast({
      title: day?.locked ? "Day unlocked" : "Day locked",
      description: day?.locked
        ? `Day ${day.day} content is now available to the chatbot`
        : `Day ${day?.day} content is now restricted from the chatbot`,
    });
    setPublished(false);
  };

  const toggleDay = (id: string) => {
    setExpandedDays((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  };

  const startEditDay = (dp: DayPlan) => {
    setEditingDayId(dp.id); setEditTopic(dp.topic); setEditDates(dp.dates);
  };

  const saveEditDay = () => {
    if (!editingDayId) return;
    setDays((prev) => prev.map((d) => d.id === editingDayId ? { ...d, topic: editTopic, dates: editDates } : d));
    setEditingDayId(null); setPublished(false);
  };

  const handleResourceAction = useCallback((dayId: string, resourceId: string, accepted: boolean) => {
    if (accepted) {
      setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: d.resources.map((r) => r.id === resourceId ? { ...r, accepted: true } : r) } : d));
    } else {
      const day = days.find((d) => d.id === dayId);
      const resource = day?.resources.find((r) => r.id === resourceId);
      const replacement = replacementPool[replacementIdx % replacementPool.length];
      const newId = makeId();
      if (resource) {
        setUndoStack((prev) => [...prev.slice(-9), { dayId, replacementId: newId, resource: { ...resource } }]);
      }
      setReplacementIdx((i) => i + 1);
      setDays((prev) => prev.map((d) => d.id === dayId ? {
        ...d, resources: d.resources.map((r) => r.id === resourceId ? { ...replacement, id: newId, accepted: null } as Resource : r),
      } : d));
    }
    setPublished(false);
  }, [replacementIdx, days]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setDays((prev) => prev.map((d) => {
      if (d.id !== last.dayId) return d;
      const hasReplacement = d.resources.some((r) => r.id === last.replacementId);
      if (hasReplacement) return { ...d, resources: d.resources.map((r) => r.id === last.replacementId ? last.resource : r) };
      return { ...d, resources: [...d.resources, last.resource] };
    }));
  };

  const confirmRemoveResource = (dayId: string, resourceId: string) => {
    const day = days.find((d) => d.id === dayId);
    const resource = day?.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    const isAI = resource.accepted === null;
    if (isAI) {
      handleResourceAction(dayId, resourceId, false);
    } else {
      setRemoveConfirm({ dayId, resourceId, title: resource.title });
    }
  };

  const executeRemove = () => {
    if (!removeConfirm) return;
    const { dayId, resourceId } = removeConfirm;
    const day = days.find((d) => d.id === dayId);
    const resource = day?.resources.find((r) => r.id === resourceId);
    if (resource) {
      setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: d.resources.filter((r) => r.id !== resourceId) } : d));
      setPublished(false);
      toast({
        title: "Resource removed",
        description: resource.title,
        action: (
          <Button variant="outline" size="sm" onClick={() => {
            setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, resource] } : d));
          }}>
            Undo
          </Button>
        ),
      });
    }
    setRemoveConfirm(null);
  };

  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id); setEditResourceTitle(r.title); setEditResourceAction(r.action);
  };

  const saveEditResource = (dayId: string) => {
    if (!editingResourceId) return;
    setDays((prev) => prev.map((d) => d.id === dayId ? {
      ...d, resources: d.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction } : r),
    } : d));
    setEditingResourceId(null); setPublished(false);
  };

  const deleteDay = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, day: i + 1 }))); setPublished(false);
  };

  const addDay = () => {
    const newDay: DayPlan = { id: `d_new_${Date.now()}`, day: days.length + 1, dates: `Day ${days.length + 1}`, topic: "New Topic", resources: [], weightage: 0, locked: false };
    setDays((prev) => [...prev, newDay]);
    setExpandedDays((prev) => [...prev, newDay.id]);
    startEditDay(newDay); setPublished(false);
  };

  const addResourceToDay = (dayId: string, type: Resource["type"]) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type, accepted: true, provenance: "instructor" };
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, newResource] } : d));
    setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction(""); setPublished(false);
  };

  const handlePublish = () => {
    setPublished(true);
    setPublishTimestamp(new Date().toLocaleString());
    setShowPublishModal(false);
    setPublishChecklist({ days: false, resources: false });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "AI WORKSHOP LESSON PLAN - Intro to Python\n";
    content += `${days.length} Days\n\n`;
    days.forEach((d) => {
      content += `Day ${d.day} (${d.dates}): ${d.topic} [${d.weightage}%] ${d.locked ? "[LOCKED]" : "[UNLOCKED]"}\n`;
      d.resources.forEach((r) => {
        const status = r.accepted === true ? "✓" : r.accepted === null ? "★" : "";
        content += `  ${status} [${typeLabels[r.type]}] ${r.title}\n    → ${r.action}\n`;
      });
      content += "\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = format === "pdf" ? "workshop-plan.pdf" : "workshop-plan.doc"; a.click();
    URL.revokeObjectURL(url);
  };

  const genSteps = [
    { label: "Reading uploads", desc: "Parsing your syllabus and materials" },
    { label: "Mapping daily topics", desc: "Aligning with curriculum standards" },
    { label: "Creating resources & activities", desc: "Building exercises, case studies, and readings" },
  ];

  const lockedDaysCount = days.filter(d => d.locked).length;

  if (phase === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-[640px] text-center space-y-8">
          <div>
            <h1 className="font-heading text-2xl font-bold">Generating your workshop lesson plan</h1>
            <p className="text-sm text-muted-foreground mt-2">Usually takes 30–90 seconds.</p>
          </div>
          <div className="space-y-3">
            {genSteps.map((step, i) => (
              <div key={i} className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                i < genStep ? "border-primary/30 bg-primary/5" : i === genStep ? "border-primary bg-primary/5" : "border-border"
              }`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                  i < genStep ? "bg-primary text-primary-foreground" : i === genStep ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {i < genStep ? <Check className="h-4 w-4" /> : i === genStep ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </div>
                <div className="text-left">
                  <p className={`text-sm font-medium ${i <= genStep ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">You can leave this page — we'll keep working.</p>
          {genElapsed > 90 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
              <p className="text-sm font-medium">This is taking longer than usual.</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setGenStep(0); setGenElapsed(0); }}>Retry generation</Button>
                <Button variant="ghost" size="sm">Continue waiting</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const allChecked = publishChecklist.days && publishChecklist.resources;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-5">
        <SetupProgressBar currentStep={3} />

        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Next<span className="text-primary">Step</span></h1>
        </div>

        {published && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Published</Badge>
              <span className="text-xs text-muted-foreground">{publishTimestamp}</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <ExternalLink className="h-3 w-3" /> Preview student view
            </Button>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">AI Workshop Lesson Plan</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            We've analyzed your uploaded materials to draft a 3-day workshop lesson plan. Review the daily breakdown below, accept or replace AI suggestions, and edit as needed.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium bg-primary/5 border-primary/20 text-primary">
            <FlaskConical className="h-3.5 w-3.5" /> Interactive Exercises
          </div>
          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium bg-primary/5 border-primary/20 text-primary">
            <LibraryBig className="h-3.5 w-3.5" /> Case Studies
          </div>
          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium bg-primary/5 border-primary/20 text-primary">
            <Newspaper className="h-3.5 w-3.5" /> Articles & Industry Context
          </div>
        </div>

        {/* Lock status summary + auto-unlock callout */}
        <div className="flex items-center gap-3 rounded-lg border px-4 py-2.5 bg-muted/30">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-medium">{lockedDaysCount}</span> of {days.length} days locked — chatbot will only use content from locked days
          </span>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          <span className="text-primary mt-0.5">💡</span>
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">Auto-unlock:</strong> Days are automatically unlocked as the workshop progresses. Day 1 is unlocked on the first day, Day 2 on the second, and so on. You can also manually lock/unlock any day at any time to override.
          </span>
        </div>

        {/* Weightage Summary */}
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-warning/30 bg-warning/5"}`}>
          <span className="text-sm font-medium">Total Weightage:</span>
          <span className={`text-lg font-bold ${totalWeightage === 100 ? "text-primary" : "text-warning"}`}>{totalWeightage}%</span>
          <span className="text-xs text-muted-foreground">/ 100%</span>
          {totalWeightage !== 100 && <span className="text-xs text-warning ml-auto">Adjust day weightages to total 100%</span>}
          {totalWeightage === 100 && <Check className="h-4 w-4 text-primary ml-auto" />}
        </div>

        {/* Day Plan subhead with export + undo */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-xl font-semibold">Workshop Lesson Plan</h2>
          <div className="flex items-center gap-2">
            {undoStack.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleUndo} className="text-xs">
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Export Plan</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("pdf")}><FileText className="mr-2 h-4 w-4" /> Export as PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("word")}><FileDown className="mr-2 h-4 w-4" /> Export as Word</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Day Plans */}
        <Reorder.Group axis="y" values={days} onReorder={(newOrder) => setDays(newOrder.map((d, i) => ({ ...d, day: i + 1 })))}>
          <div className="space-y-2">
            {days.map((dp) => {
              const isExpanded = expandedDays.includes(dp.id);
              const isEditing = editingDayId === dp.id;
              const aiResources = dp.resources.filter((r) => r.accepted === null);
              const suggestionLabel = aiResources.length === 1 ? "1 suggested resource" : `${aiResources.length} suggested resources`;

              return (
                <Reorder.Item key={dp.id} value={dp} className="list-none">
                  <div className={`rounded-lg border bg-card shadow-sm ${dp.locked ? "border-primary/30" : ""}`}>
                    <div className="flex items-center gap-1 px-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                      <button onClick={() => toggleDay(dp.id)} className="flex flex-1 items-center justify-between px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded">
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant="outline" className="font-mono text-xs shrink-0">Day {dp.day}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{dp.topic}</p>
                            <p className="text-xs text-muted-foreground">{dp.dates} · Generated from your course materials</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Lock/Unlock */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-2 text-xs ${dp.locked ? "text-primary" : "text-muted-foreground"}`}
                            onClick={(e) => { e.stopPropagation(); toggleLock(dp.id); }}
                            title={dp.locked ? "Unlock this day's content" : "Lock this day's content for chatbot"}
                          >
                            {dp.locked ? <Lock className="h-3.5 w-3.5 mr-1" /> : <Unlock className="h-3.5 w-3.5 mr-1" />}
                            {dp.locked ? "Locked" : "Unlocked"}
                          </Button>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Input type="number" min={0} max={100} value={dp.weightage} onChange={(e) => updateWeightage(dp.id, parseInt(e.target.value) || 0)} className="h-7 w-14 text-xs text-center" />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          {aiResources.length > 0 && (
                            <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 border font-medium">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />{suggestionLabel}
                            </Badge>
                          )}
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                    </div>

                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t px-4 py-3 space-y-3">
                        {isEditing ? (
                          <div className="space-y-2 p-3 rounded-md bg-muted/30 border">
                            <div className="space-y-1"><Label className="text-xs">Topic</Label><Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-8 text-sm" /></div>
                            <div className="space-y-1"><Label className="text-xs">Dates</Label><Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-8 text-sm" /></div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={saveEditDay} className="h-7 text-xs">Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingDayId(null)} className="h-7 text-xs">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => startEditDay(dp)} className="h-7 text-xs">
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteDay(dp.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Resources & Materials</p>
                          {dp.resources.map((r) => {
                            const isAI = r.accepted === null;
                            const isEditingThis = editingResourceId === r.id;
                            const prov = r.provenance ? provenanceLabels[r.provenance] : null;
                            return (
                              <div key={r.id} className={`rounded-md px-3 py-2.5 text-xs border ${isAI ? "border-primary/30 bg-primary/5" : "border-border bg-background"}`}>
                                {isEditingThis ? (
                                  <div className="space-y-2">
                                    <div className="space-y-1"><Label className="text-[10px]">Title</Label><Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-7 text-xs" /></div>
                                    <div className="space-y-1"><Label className="text-[10px]">Action / Description</Label><Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} className="h-7 text-xs" /></div>
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => saveEditResource(dp.id)} className="h-6 text-[10px] px-2">Save</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setEditingResourceId(null)} className="h-6 text-[10px] px-2">Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 min-w-0">
                                      {isAI && <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                                      {r.accepted === true && <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${typeColors[r.type] || "bg-muted text-muted-foreground"}`}>{typeLabels[r.type]}</span>
                                          <span className="font-medium">{r.title}</span>
                                          {prov && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${prov.className}`}>{prov.label}</Badge>}
                                          {r.source && (
                                            <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                              <ExternalLink className="h-2.5 w-2.5" /> {r.source}
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-muted-foreground mt-1 leading-relaxed">{r.action}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                      <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-6 px-2 text-[10px]">
                                        <Pencil className="h-3 w-3 mr-1" /> Edit
                                      </Button>
                                      {isAI && (
                                        <Button variant="ghost" size="sm" onClick={() => handleResourceAction(dp.id, r.id, true)} className="h-6 px-2 text-[10px]">
                                          <ThumbsUp className="h-3 w-3 mr-1" /> Accept
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="sm" onClick={() => confirmRemoveResource(dp.id, r.id)} className="h-6 px-2 text-[10px] text-destructive hover:text-destructive">
                                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {(["textbook", "exercise", "case-study", "article"] as Resource["type"][]).map((type) => (
                              <Button key={type} size="sm" variant="outline" onClick={() => addResourceToDay(dp.id, type)} className="h-7 text-[10px] border-dashed">
                                <Plus className="h-3 w-3 mr-1" /> {typeLabels[type]}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </Reorder.Item>
              );
            })}
          </div>
        </Reorder.Group>

        <Button variant="outline" onClick={addDay} className="w-full border-dashed">
          <Plus className="mr-2 h-4 w-4" /> Add Day
        </Button>

        <div className="sticky bottom-0 bg-background border-t py-4 -mx-4 px-4 flex justify-between items-center z-10">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/quality-check")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={addDay}>
              <Plus className="mr-1 h-4 w-4" /> Add Day
            </Button>
            {!published ? (
              <Button onClick={() => setShowPublishModal(true)}>
                Publish plan & activate Student TA <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate("/teacher/setup/diagnostic")}>
                Review Diagnostic Questions <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Publish Confirmation Modal */}
      <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish to students?</DialogTitle>
            <DialogDescription>Students will see day topics, approved resources, and TA practice prompts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={publishChecklist.days} onCheckedChange={(v) => setPublishChecklist((p) => ({ ...p, days: !!v }))} />
              <span className="text-sm">Days and topics look correct</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={publishChecklist.resources} onCheckedChange={(v) => setPublishChecklist((p) => ({ ...p, resources: !!v }))} />
              <span className="text-sm">Resources are appropriate for this cohort</span>
            </label>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPublishModal(false)}>Keep editing</Button>
            <Button onClick={handlePublish} disabled={!allChecked}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Modal */}
      <Dialog open={!!removeConfirm} onOpenChange={() => setRemoveConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this resource?</DialogTitle>
            <DialogDescription>This removes "{removeConfirm?.title}" from this day's plan. You can undo right after.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={executeRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourseCreation;
