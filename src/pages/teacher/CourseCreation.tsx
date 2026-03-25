import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Check, X, ArrowRight, ArrowLeft, Sparkles, Loader2,
  ChevronDown, ChevronUp, Download, Pencil, GripVertical,
  BookOpen, Plus, Trash2, FileText, FileDown,
  Lock, Unlock, ClipboardList,
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
  description: string;
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
  {
    id: "d1", day: 1, dates: "Day 1", topic: "Python Fundamentals: Variables, Data Types & Control Flow",
    description: "Introduce students to Python basics including variables, data types, operators, and control flow. Start with IDE setup and progress to interactive coding exercises.",
    weightage: 30, locked: true,
    resources: [
      { id: "r1", title: "Intro to Python Slides", action: "Cover variables, data types, operators, and basic I/O", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r2", title: "Python Setup Guide", action: "Help students install Python and set up their IDE", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r4", title: "Interactive Coding Exercise", action: "Practice variables and data types in live coding session", type: "exercise", accepted: true, provenance: "uploads" },
    ],
  },
  {
    id: "d2", day: 2, dates: "Day 2", topic: "Functions, Lists & Dictionaries",
    description: "Deep dive into function definitions, parameters, return values, and Python's core data structures. Hands-on labs reinforce concepts through practical application.",
    weightage: 40, locked: false,
    resources: [
      { id: "r3", title: "Functions & Data Structures Slides", action: "Cover function definitions, parameters, return values, lists, and dictionaries", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r6", title: "Calculator Lab", action: "Build a calculator using functions", type: "lab", accepted: true, provenance: "uploads" },
      { id: "r11", title: "List Comprehension Exercise", action: "Hands-on practice with list comprehensions and dictionary operations", type: "lab", accepted: true, provenance: "uploads" },
    ],
  },
  {
    id: "d3", day: 3, dates: "Day 3", topic: "File Handling, OOP Basics & Review",
    description: "Cover object-oriented programming fundamentals and file I/O operations. Conclude with a comprehensive workshop review and project showcase.",
    weightage: 30, locked: false,
    resources: [
      { id: "r18", title: "OOP & File Handling Slides", action: "Cover classes, objects, file reading/writing", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r21", title: "File Organizer Project", action: "Build a simple file organizer script", type: "exercise", accepted: true, provenance: "uploads" },
      { id: "r16", title: "Workshop Review Sheet", action: "Comprehensive review covering all workshop topics", type: "textbook", accepted: true, provenance: "uploads" },
    ],
  },
];

const CourseCreation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const courseId = (location.state as any)?.courseId || localStorage.getItem("currentCourseId");

  // Phase
  const [phase, setPhase] = useState<"upload" | "generating" | "plan">("upload");

  // Upload state
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [materialsFiles, setMaterialsFiles] = useState<UploadedFile[]>([]);

  // Generation state
  const [genStep, setGenStep] = useState(0);
  const [genElapsed, setGenElapsed] = useState(0);

  // Plan state
  const [days, setDays] = useState<DayPlan[]>(initialPlan);
  const [expandedDays, setExpandedDays] = useState<string[]>(initialPlan.map((d) => d.id));
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ days: false, resources: false });
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ dayId: string; resourceId: string; title: string } | null>(null);
  const [suggestingDayId, setSuggestingDayId] = useState<string | null>(null);

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
    if (courseId && user) {
      const allPaths = [...lessonPlanFiles.map((f) => f.path), ...materialsFiles.map((f) => f.path)];
      if (allPaths.length > 0) {
        await supabase
          .from("course_material_files")
          .update({ course_id: courseId })
          .in("storage_path", allPaths);
      }
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

  // Day editing
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

  const updateWeightage = (dayId: string, value: number) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, weightage: Math.max(0, value) } : d));
    setPublished(false);
  };

  const updateDescription = (dayId: string, description: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, description } : d));
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

  const deleteDay = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, day: i + 1 })));
    setPublished(false);
  };

  const addDay = () => {
    const newDay: DayPlan = {
      id: `d_new_${Date.now()}`, day: days.length + 1, dates: `Day ${days.length + 1}`,
      topic: "New Topic", description: "", resources: [], weightage: 0, locked: false,
    };
    setDays((prev) => [...prev, newDay]);
    setExpandedDays((prev) => [...prev, newDay.id]);
    startEditDay(newDay); setPublished(false);
  };

  // Resource editing
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

  const addResourceToDay = (dayId: string, type: Resource["type"]) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type, accepted: true, provenance: "instructor" };
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, newResource] } : d));
    setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction(""); setPublished(false);
  };

  const removeResource = (dayId: string, resourceId: string) => {
    const day = days.find((d) => d.id === dayId);
    const resource = day?.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    setRemoveConfirm({ dayId, resourceId, title: resource.title });
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

  // AI Suggest
  const handleAiSuggest = async (dayId: string) => {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;

    setSuggestingDayId(dayId);
    try {
      // Get course objectives from storage
      let objectives: string[] = [];
      if (courseId) {
        const { data: course } = await supabase
          .from("courses")
          .select("objectives")
          .eq("id", courseId)
          .single();
        if (course?.objectives) objectives = course.objectives;
      }

      const { data, error } = await supabase.functions.invoke("suggest-lesson", {
        body: {
          dayNumber: day.day,
          dayTopic: day.topic,
          existingDescription: day.description || "",
          courseObjectives: objectives,
          totalDays: days.length,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "AI suggestion failed", description: data.error, variant: "destructive" });
        return;
      }

      if (data?.suggestion) {
        updateDescription(dayId, data.suggestion);
        toast({ title: "Suggestion generated", description: `AI suggestion applied to Day ${day.day}. You can edit it freely.` });
      }
    } catch (err: any) {
      console.error("AI suggest error:", err);
      toast({ title: "Failed to generate suggestion", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setSuggestingDayId(null);
    }
  };

  // Publish & Export
  const handlePublish = () => {
    setPublished(true);
    setPublishTimestamp(new Date().toLocaleString());
    setShowPublishModal(false);
    setPublishChecklist({ days: false, resources: false });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "LESSON PLAN\n";
    content += `${days.length} Days\n\n`;
    days.forEach((d) => {
      content += `Day ${d.day} (${d.dates}): ${d.topic} [${d.weightage}%]\n`;
      if (d.description) content += `\nDescription:\n${d.description}\n`;
      content += "\nResources:\n";
      d.resources.forEach((r) => {
        content += `  - [${typeLabels[r.type]}] ${r.title}\n    ${r.action}\n`;
      });
      content += "\n---\n\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = format === "pdf" ? "lesson-plan.pdf" : "lesson-plan.doc"; a.click();
    URL.revokeObjectURL(url);
  };

  const genSteps = [
    { label: "Reading uploads", desc: "Parsing your syllabus and materials" },
    { label: "Mapping daily topics", desc: "Aligning with curriculum standards" },
    { label: "Creating resources & activities", desc: "Building exercises, case studies, and readings" },
  ];

  const lockedDaysCount = days.filter(d => d.locked).length;

  // ─── UPLOAD PHASE ───
  if (phase === "upload") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-3xl">
          <SetupProgressBar currentStep={3} />

          <div className="mb-8 text-center">
            <h1 className="font-heading text-3xl font-bold">
              Lesson <span className="text-primary">Plan</span>
            </h1>
            <p className="mt-2 text-muted-foreground">
              Upload your lesson plans and course materials. AI will review your lesson plans and generate a workshop plan.
            </p>
          </div>

          {/* Lesson Plan Upload */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-primary" /> Upload Lesson Plans
                <span className="text-[10px] font-normal text-muted-foreground">(Internal)</span>
              </CardTitle>
              <CardDescription>
                These files help us understand the structure of your course's topics over the semester and each class or weekly topic covered, guiding your instruction plan. They are internal and not shared with students.
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
                  folderPath={`${user.id}/lesson-plans`}
                  accept={UPLOAD_ACCEPT}
                  files={lessonPlanFiles}
                  onFilesChange={setLessonPlanFiles}
                  teacherId={user.id}
                  folderType="lesson-plans"
                  courseId={courseId}
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                  Preparing upload area…
                </div>
              )}
            </CardContent>
          </Card>

          {/* Course Materials Upload */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" /> Upload Course Materials
                <span className="text-[10px] font-normal text-muted-foreground">(Student-Facing · Optional)</span>
              </CardTitle>
              <CardDescription>
                These materials will be used to understand the curriculum and power the AI Teaching Assistant for students. They include slides, textbooks, readings, and other resources you want students to access.
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
                  folderPath={`${user.id}/materials`}
                  accept={UPLOAD_ACCEPT}
                  files={materialsFiles}
                  onFilesChange={setMaterialsFiles}
                  teacherId={user.id}
                  folderType="materials"
                  courseId={courseId}
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                  Preparing upload area…
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate("/teacher/setup/quality-check")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
            <Button
              onClick={handleStartGeneration}
              disabled={lessonPlanFiles.length === 0}
              size="lg"
            >
              Generate Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── GENERATING PHASE ───
  if (phase === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-[640px] text-center space-y-8">
          <div>
            <h1 className="font-heading text-2xl font-bold">Generating your lesson plan</h1>
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
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
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

  // ─── PLAN PHASE ───
  const allChecked = publishChecklist.days && publishChecklist.resources;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-5">
        <SetupProgressBar currentStep={3} />

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="font-heading text-3xl font-bold">
            AI Workshop <span className="text-primary">Lesson Plan</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            We've analyzed your uploaded materials to draft a lesson plan. Each day is fully editable — adjust topics, descriptions, and resources as needed. Use <strong>AI Suggest</strong> for detailed lesson guidance.
          </p>
        </div>

        {published && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Published</Badge>
              <span className="text-xs text-muted-foreground">{publishTimestamp}</span>
            </div>
          </div>
        )}

        {/* Weightage + Lock summaries */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
            <span className="text-sm font-medium">Total Weightage:</span>
            <span className={`text-lg font-bold ${totalWeightage === 100 ? "text-primary" : "text-destructive"}`}>{totalWeightage}%</span>
            <span className="text-xs text-muted-foreground">/ 100%</span>
            {totalWeightage === 100 && <Check className="h-4 w-4 text-primary ml-auto" />}
          </div>
          <div className="flex items-center gap-3 rounded-lg border px-4 py-2.5 bg-muted/30">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium">{lockedDaysCount}</span> of {days.length} days locked
            </span>
          </div>
        </div>

        {/* Export bar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Daily Breakdown</h2>
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

        {/* Day Cards */}
        <Reorder.Group axis="y" values={days} onReorder={(newOrder) => setDays(newOrder.map((d, i) => ({ ...d, day: i + 1 })))}>
          <div className="space-y-3">
            {days.map((dp) => {
              const isExpanded = expandedDays.includes(dp.id);
              const isEditing = editingDayId === dp.id;
              const isSuggesting = suggestingDayId === dp.id;

              return (
                <Reorder.Item key={dp.id} value={dp} className="list-none">
                  <Card className={`overflow-hidden ${dp.locked ? "border-primary/30" : ""}`}>
                    {/* Day Header */}
                    <div className="flex items-center gap-1 px-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                      <button
                        onClick={() => toggleDay(dp.id)}
                        className="flex flex-1 items-center justify-between px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant="outline" className="font-mono text-xs shrink-0">Day {dp.day}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{dp.topic}</p>
                            <p className="text-xs text-muted-foreground">{dp.dates} · {dp.weightage}% weightage</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-2 text-xs ${dp.locked ? "text-primary" : "text-muted-foreground"}`}
                            onClick={(e) => { e.stopPropagation(); toggleLock(dp.id); }}
                          >
                            {dp.locked ? <Lock className="h-3.5 w-3.5 mr-1" /> : <Unlock className="h-3.5 w-3.5 mr-1" />}
                            {dp.locked ? "Locked" : "Unlocked"}
                          </Button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t">
                        <div className="px-5 py-4 space-y-4">
                          {/* Editable header fields */}
                          {isEditing ? (
                            <div className="space-y-3 p-3 rounded-md bg-muted/30 border">
                              <div className="space-y-1">
                                <Label className="text-xs">Topic</Label>
                                <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-8 text-sm" />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Date / Label</Label>
                                  <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Weightage (%)</Label>
                                  <Input type="number" min={0} max={100} value={dp.weightage} onChange={(e) => updateWeightage(dp.id, parseInt(e.target.value) || 0)} className="h-8 text-sm" />
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <Button size="sm" onClick={saveEditDay} className="h-7 text-xs">Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingDayId(null)} className="h-7 text-xs">Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => startEditDay(dp)} className="h-7 text-xs">
                                <Pencil className="h-3 w-3 mr-1" /> Edit Day Info
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteDay(dp.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3 mr-1" /> Remove Day
                              </Button>
                            </div>
                          )}

                          {/* Description with AI Suggest */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">Lesson Description</Label>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAiSuggest(dp.id)}
                                disabled={isSuggesting}
                                className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                              >
                                {isSuggesting ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3" /> AI Suggest
                                  </>
                                )}
                              </Button>
                            </div>
                            <Textarea
                              value={dp.description}
                              onChange={(e) => updateDescription(dp.id, e.target.value)}
                              placeholder="Describe what this day covers — learning outcomes, activities, timing, and teaching approach. Or click AI Suggest to auto-generate."
                              className="min-h-[120px] text-sm leading-relaxed resize-y"
                              disabled={isSuggesting}
                            />
                            {isSuggesting && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" /> AI is generating a detailed lesson description…
                              </p>
                            )}
                          </div>

                          {/* Resources */}
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Resources & Materials</p>
                            {dp.resources.length === 0 && (
                              <p className="text-xs text-muted-foreground italic py-2">No resources added yet. Use the buttons below to add resources.</p>
                            )}
                            {dp.resources.map((r) => {
                              const isEditingThis = editingResourceId === r.id;
                              const prov = r.provenance ? provenanceLabels[r.provenance] : null;
                              return (
                                <div key={r.id} className="rounded-md px-3 py-2.5 text-xs border border-border bg-background">
                                  {isEditingThis ? (
                                    <div className="space-y-2">
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Title</Label>
                                        <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-7 text-xs" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Description</Label>
                                        <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} className="h-7 text-xs" />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => saveEditResource(dp.id)} className="h-6 text-[10px] px-2">Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingResourceId(null)} className="h-6 text-[10px] px-2">Cancel</Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2 min-w-0">
                                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${typeColors[r.type] || "bg-muted text-muted-foreground"}`}>
                                              {typeLabels[r.type]}
                                            </span>
                                            <span className="font-medium">{r.title}</span>
                                            {prov && (
                                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${prov.className}`}>
                                                {prov.label}
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-muted-foreground mt-1 leading-relaxed">{r.action}</p>
                                        </div>
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-6 px-2 text-[10px]">
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => removeResource(dp.id, r.id)} className="h-6 px-2 text-[10px] text-destructive hover:text-destructive">
                                          <Trash2 className="h-3 w-3" />
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
                        </div>
                      </motion.div>
                    )}
                  </Card>
                </Reorder.Item>
              );
            })}
          </div>
        </Reorder.Group>

        <Button variant="outline" onClick={addDay} className="w-full border-dashed">
          <Plus className="mr-2 h-4 w-4" /> Add Day
        </Button>

        {/* Bottom Bar */}
        <div className="sticky bottom-0 bg-background border-t py-4 -mx-4 px-4 flex justify-between items-center z-10">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/quality-check")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {!published ? (
              <Button onClick={() => setShowPublishModal(true)}>
                Publish Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate("/teacher/setup/diagnostic")}>
                Continue to Diagnostic Questions <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Publish Confirmation Modal */}
      <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Lesson Plan?</DialogTitle>
            <DialogDescription>
              You don't need to complete every day — you can always come back to add or edit days later. Students will see the published content.
            </DialogDescription>
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
            <DialogDescription>This removes "{removeConfirm?.title}" from this day's plan.</DialogDescription>
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
