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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Check, X, ArrowRight, ArrowLeft, Sparkles, Loader2,
  ChevronDown, ChevronUp, Download, Pencil, GripVertical,
  BookOpen, Plus, Trash2, FileText, FileDown,
  Eye, EyeOff, ClipboardList,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  isNew?: boolean;
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
  textbook: "Textbook / Reading",
  exercise: "Interactive Exercise",
  lab: "Lab / Hands-on",
  tool: "Tool / Software",
  "case-study": "Case Study",
  article: "Article / Industry",
  news: "News / Current Events",
  video: "Video",
};

const typeIcons: Record<string, string> = {
  textbook: "📖",
  exercise: "🏋️",
  lab: "🧪",
  tool: "🔧",
  "case-study": "📋",
  article: "📰",
  news: "📰",
  video: "🎬",
};

const typeColors: Record<string, string> = {
  textbook: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800",
  exercise: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
  lab: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
  tool: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800",
  "case-study": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  article: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800",
  news: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800",
  video: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800",
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

const resourceTypeOptions: { value: Resource["type"]; label: string }[] = [
  { value: "textbook", label: "Textbook / Reading" },
  { value: "exercise", label: "Interactive Exercise" },
  { value: "lab", label: "Lab / Hands-on" },
  { value: "case-study", label: "Case Study" },
  { value: "article", label: "Article / Industry Context" },
  { value: "video", label: "Video" },
  { value: "tool", label: "Tool / Software" },
];

const initialPlan: DayPlan[] = [
  {
    id: "d1", day: 1, dates: "Day 1", topic: "Python Fundamentals: Variables, Data Types & Control Flow",
    description: "**Overview:**\nIntroduce students to Python basics including variables, data types, operators, and control flow. Start with IDE setup and progress to interactive coding exercises.\n\n**Learning Outcomes:**\n- Understand Python variables and data types\n- Write basic control flow statements\n- Set up a Python development environment",
    weightage: 30, locked: false,
    resources: [
      { id: "r1", title: "Intro to Python Slides", action: "Cover variables, data types, operators, and basic I/O", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r2", title: "Python Setup Guide", action: "Help students install Python and set up their IDE", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r4", title: "Interactive Coding Exercise", action: "Practice variables and data types in live coding session", type: "exercise", accepted: true, provenance: "uploads" },
    ],
  },
  {
    id: "d2", day: 2, dates: "Day 2", topic: "Functions, Lists & Dictionaries",
    description: "**Overview:**\nDeep dive into function definitions, parameters, return values, and Python's core data structures.\n\n**Learning Outcomes:**\n- Define and call functions with parameters\n- Work with lists and dictionaries\n- Apply list comprehensions",
    weightage: 40, locked: true,
    resources: [
      { id: "r3", title: "Functions & Data Structures Slides", action: "Cover function definitions, parameters, return values, lists, and dictionaries", type: "textbook", accepted: true, provenance: "uploads" },
      { id: "r6", title: "Calculator Lab", action: "Build a calculator using functions", type: "lab", accepted: true, provenance: "uploads" },
      { id: "r11", title: "List Comprehension Exercise", action: "Hands-on practice with list comprehensions and dictionary operations", type: "lab", accepted: true, provenance: "uploads" },
    ],
  },
  {
    id: "d3", day: 3, dates: "Day 3", topic: "File Handling, OOP Basics & Review",
    description: "**Overview:**\nCover object-oriented programming fundamentals and file I/O operations. Conclude with a comprehensive workshop review.\n\n**Learning Outcomes:**\n- Understand classes and objects\n- Read and write files in Python\n- Synthesize all workshop concepts",
    weightage: 30, locked: true,
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

  const [phase, setPhase] = useState<"upload" | "generating" | "plan">("upload");
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [materialsFiles, setMaterialsFiles] = useState<UploadedFile[]>([]);
  const [genStep, setGenStep] = useState(0);
  const [genElapsed, setGenElapsed] = useState(0);
  const [days, setDays] = useState<DayPlan[]>(initialPlan);
  const [expandedDays, setExpandedDays] = useState<string[]>(initialPlan.map((d) => d.id));
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [editResourceType, setEditResourceType] = useState<Resource["type"]>("textbook");
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ days: false, resources: false });
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ dayId: string; resourceId: string; title: string } | null>(null);
  const [suggestingDayId, setSuggestingDayId] = useState<string | null>(null);
  const [addingResourceDayId, setAddingResourceDayId] = useState<string | null>(null);
  const [newResourceType, setNewResourceType] = useState<Resource["type"]>("exercise");

  const totalWeightage = days.reduce((sum, d) => sum + (d.weightage || 0), 0);

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
      title: day?.locked ? "Now visible to students" : "Hidden from students",
      description: day?.locked
        ? `Day ${day.day} content is now visible to students`
        : `Day ${day?.day} content is now hidden from students`,
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
      topic: "New Topic", description: "", resources: [], weightage: 0, locked: true,
    };
    setDays((prev) => [...prev, newDay]);
    setExpandedDays((prev) => [...prev, newDay.id]);
    startEditDay(newDay); setPublished(false);
  };

  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id); setEditResourceTitle(r.title); setEditResourceAction(r.action); setEditResourceType(r.type);
  };

  const saveEditResource = (dayId: string) => {
    if (!editingResourceId) return;
    setDays((prev) => prev.map((d) => d.id === dayId ? {
      ...d, resources: d.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction, type: editResourceType } : r),
    } : d));
    setEditingResourceId(null); setPublished(false);
  };

  const handleAddResource = (dayId: string) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type: newResourceType, accepted: true, provenance: "instructor" };
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, newResource] } : d));
    setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction(""); setEditResourceType(newResourceType);
    setAddingResourceDayId(null); setPublished(false);
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

  // AI Suggest - now also generates resources
  const handleAiSuggest = async (dayId: string) => {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;

    setSuggestingDayId(dayId);
    try {
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
          existingResources: day.resources.map(r => ({ title: r.title, action: r.action })),
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "AI suggestion failed", description: data.error, variant: "destructive" });
        return;
      }

      if (data?.suggestion) {
        updateDescription(dayId, data.suggestion);
      }

      // Add suggested resources
      if (data?.suggestedResources?.length > 0) {
        const newResources: Resource[] = data.suggestedResources.map((r: any) => ({
          id: makeId(),
          title: r.title || "Untitled Resource",
          action: r.action || "",
          type: r.type || "exercise",
          accepted: true,
          provenance: r.provenance || "instructor",
          isNew: true,
        }));
        setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, ...newResources] } : d));
        toast({
          title: "AI suggestion applied",
          description: `Updated lesson description and added ${newResources.length} suggested resource${newResources.length > 1 ? "s" : ""} to Day ${day.day}.`,
        });
      } else {
        toast({ title: "Suggestion generated", description: `AI suggestion applied to Day ${day.day}. You can edit it freely.` });
      }
    } catch (err: any) {
      console.error("AI suggest error:", err);
      toast({ title: "Failed to generate suggestion", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setSuggestingDayId(null);
    }
  };

  const handlePublish = async () => {
    setPublished(true);
    setPublishTimestamp(new Date().toLocaleString());
    setShowPublishModal(false);
    setPublishChecklist({ days: false, resources: false });

    // Clear isNew flags and save plan to storage
    if (user) {
      try {
        const cleanDays = days.map(d => ({
          ...d,
          resources: d.resources.map(r => { const { isNew, ...rest } = r; return rest; }),
        }));
        setDays(cleanDays);
        const planJson = JSON.stringify(cleanDays, null, 2);
        const blob = new Blob([planJson], { type: "application/json" });
        const file = new File([blob], "published-plan.json", { type: "application/json" });
        await supabase.storage
          .from("course-materials")
          .upload(`${user.id}/lesson-plan/published-plan.json`, file, { upsert: true, cacheControl: "0" });
      } catch (err) {
        console.error("Failed to save plan to storage:", err);
      }
    }
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

  const renderDescription = (desc: string) => {
    if (!desc) return null;
    const cleaned = desc.replace(/\*\*/g, "");
    const sections = cleaned.split(/\n(?=[A-Z][^:\n]+:)/);
    return (
      <div className="space-y-3">
        {sections.map((section, i) => {
          const headingMatch = section.match(/^([A-Z][^:\n]+):\s*/);
          if (headingMatch) {
            const heading = headingMatch[1];
            const body = section.replace(/^[A-Z][^:\n]+:\s*/, "").trim();
            const lines = body.split("\n").filter(l => l.trim());
            const isList = lines.every(l => /^[-•]/.test(l.trim()));
            return (
              <Collapsible key={i} defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors w-full text-left">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  {heading}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-5 pt-1.5">
                  {isList ? (
                    <ul className="space-y-1">
                      {lines.map((line, j) => (
                        <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="mt-2 shrink-0 h-1 w-1 rounded-full bg-primary inline-block" />
                          <span>{line.replace(/^[-•]\s*/, "")}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          }
          return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{section}</p>;
        })}
      </div>
    );
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

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-primary" /> Upload Lesson Plans
              </CardTitle>
              <CardDescription>
                These files help us understand the structure of your course's topics over the semester and each class or weekly topic covered, guiding your instruction plan.
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

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" /> Upload Course Materials
                <span className="text-[10px] font-normal text-muted-foreground">(Optional)</span>
              </CardTitle>
              <CardDescription>
                These are student-facing materials that are used in class sessions. These materials will be used to understand the curriculum and power the AI Teaching Assistant for students.
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
            <Button onClick={handleStartGeneration} disabled={lessonPlanFiles.length === 0} size="lg">
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
      <div className="w-full max-w-4xl space-y-6">
        <SetupProgressBar currentStep={3} />

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="font-heading text-3xl font-bold">
            AI Workshop <span className="text-primary">Lesson Plan</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            We've analyzed your uploaded materials to draft a lesson plan. Each day is fully editable — adjust topics, descriptions, and resources as needed. Use <strong className="text-foreground">AI Suggest</strong> to auto-generate detailed lesson guidance and additional resources.
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
          <div className="space-y-4">
            {days.map((dp) => {
              const isExpanded = expandedDays.includes(dp.id);
              const isEditing = editingDayId === dp.id;
              const isSuggesting = suggestingDayId === dp.id;

              return (
                <Reorder.Item key={dp.id} value={dp} className="list-none">
                  <Card className={`overflow-hidden transition-all ${dp.locked ? "border-primary/20 shadow-sm" : "border-border"} ${isExpanded ? "shadow-md" : ""}`}>
                    {/* Day Header */}
                    <div className="flex items-center gap-1 px-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                      <button
                        onClick={() => toggleDay(dp.id)}
                        className="flex flex-1 items-center justify-between px-3 py-3.5 text-left hover:bg-muted/20 transition-colors rounded"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 bg-muted text-muted-foreground">
                            <span className="text-sm font-bold">{dp.day}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{dp.topic}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-sm text-muted-foreground">{dp.dates}</span>
                              <span className="text-sm text-muted-foreground">·</span>
                              <span className="text-sm text-muted-foreground">{dp.weightage}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); toggleLock(dp.id); }}
                            className="h-7 px-2 text-sm"
                          >
                            {dp.locked ? (
                              <Badge variant="outline" className="text-sm gap-1 border-destructive/30 text-destructive bg-destructive/5">
                                <EyeOff className="h-3 w-3" /> Hidden from students
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-sm gap-1 border-green-500/30 text-green-600 bg-green-50 dark:bg-green-950/20 dark:text-green-400">
                                <Eye className="h-3 w-3" /> Visible to students
                              </Badge>
                            )}
                          </Button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t">
                        <div className="px-5 py-5 space-y-5">
                            {/* AI Suggest Button — prominent */}
                            <Button
                              size="lg"
                              onClick={() => handleAiSuggest(dp.id)}
                              disabled={isSuggesting}
                              className="w-full gap-2"
                            >
                              {isSuggesting ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Generating AI suggestions…</>
                              ) : (
                                <><Sparkles className="h-4 w-4" /> AI Suggest Lesson Content & Resources</>
                              )}
                            </Button>

                            {/* Editable header fields */}
                            {isEditing ? (
                              <div className="space-y-3 p-4 rounded-lg bg-muted/20 border border-dashed">
                                <div className="space-y-1.5">
                                  <Label className="text-sm font-medium">Topic</Label>
                                  <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-9 text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Date / Label</Label>
                                    <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-9 text-sm" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Weightage (%)</Label>
                                    <Input type="number" min={0} max={100} value={dp.weightage} onChange={(e) => updateWeightage(dp.id, parseInt(e.target.value) || 0)} className="h-9 text-sm" />
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" onClick={saveEditDay} className="h-8">Save Changes</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingDayId(null)} className="h-8">Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => startEditDay(dp)} className="h-8 text-sm">
                                  <Pencil className="h-3 w-3 mr-1.5" /> Edit Day Info
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteDay(dp.id)} className="h-8 text-sm text-destructive hover:text-destructive">
                                  <Trash2 className="h-3 w-3 mr-1.5" /> Remove Day
                                </Button>
                              </div>
                            )}

                            {/* Lesson Content + Integrated Resources */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-1 rounded-full bg-primary" />
                                <Label className="text-sm font-semibold">Lesson Content</Label>
                              </div>

                              {isSuggesting ? (
                                <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 flex flex-col items-center gap-3">
                                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                  <p className="text-sm text-primary font-medium">AI is generating lesson description & resources…</p>
                                  <p className="text-sm text-muted-foreground">This may take 10–20 seconds</p>
                                </div>
                              ) : (
                                <>
                                  {dp.description ? (
                                    <div className="rounded-lg border bg-muted/10 p-4">
                                      {renderDescription(dp.description)}
                                      <div className="mt-3 pt-3 border-t">
                                        <details className="group">
                                          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                                            <Pencil className="h-3 w-3" /> Edit raw text
                                          </summary>
                                          <Textarea
                                            value={dp.description}
                                            onChange={(e) => updateDescription(dp.id, e.target.value)}
                                            className="mt-2 min-h-[160px] text-sm leading-relaxed resize-y font-mono"
                                          />
                                        </details>
                                      </div>
                                    </div>
                                  ) : (
                                    <Textarea
                                      value={dp.description}
                                      onChange={(e) => updateDescription(dp.id, e.target.value)}
                                      placeholder="Describe what this day covers — or click AI Suggest above to auto-generate."
                                      className="min-h-[120px] text-sm leading-relaxed resize-y"
                                    />
                                  )}

                                  {/* Integrated Resources */}
                                  {dp.resources.length > 0 && (
                                    <div className="space-y-2 mt-4">
                                      {dp.resources.map((r) => {
                                        const isEditingThis = editingResourceId === r.id;
                                        return (
                                          <div key={r.id} className={`rounded-lg px-4 py-3 border transition-colors bg-muted/30 border-border ${r.isNew ? "border-l-4 border-l-primary bg-primary/5" : ""}`}>
                                            {isEditingThis ? (
                                              <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                  <Label className="text-sm">Type</Label>
                                                  <Select value={editResourceType} onValueChange={(v) => setEditResourceType(v as Resource["type"])}>
                                                    <SelectTrigger className="h-8 text-sm bg-background"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                      {resourceTypeOptions.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                  <Label className="text-sm">Title</Label>
                                                  <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-8 text-sm bg-background" />
                                                </div>
                                                <div className="space-y-1.5">
                                                  <Label className="text-sm">Description</Label>
                                                  <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} className="h-8 text-sm bg-background" />
                                                </div>
                                                <div className="flex gap-2">
                                                  <Button size="sm" onClick={() => saveEditResource(dp.id)} className="h-7 text-sm px-3">Save</Button>
                                                  <Button size="sm" variant="ghost" onClick={() => setEditingResourceId(null)} className="h-7 text-sm px-3">Cancel</Button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3 min-w-0">
                                                  <span className="text-base shrink-0 mt-0.5">{typeIcons[r.type] || "📄"}</span>
                                                  <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="text-sm font-medium">{r.title || "Untitled"}</span>
                                                      {r.isNew && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">AI Suggested</Badge>}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-0.5">{r.action}</p>
                                                  </div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                  <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-7 px-2 text-sm hover:bg-background/50">
                                                    <Pencil className="h-3 w-3" />
                                                  </Button>
                                                  <Button variant="ghost" size="sm" onClick={() => removeResource(dp.id, r.id)} className="h-7 px-2 text-sm text-destructive hover:text-destructive hover:bg-background/50">
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {dp.resources.length === 0 && (
                                    <div className="rounded-lg border border-dashed p-6 text-center">
                                      <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                                      <p className="text-sm text-muted-foreground">No resources added yet</p>
                                      <p className="text-sm text-muted-foreground mt-1">Add resources manually or use AI Suggest</p>
                                    </div>
                                  )}

                                  {/* Add resource */}
                                  {addingResourceDayId === dp.id ? (
                                    <div className="rounded-lg border border-dashed p-3 bg-muted/10 space-y-3">
                                      <div className="space-y-1.5">
                                        <Label className="text-sm font-medium">Resource Type</Label>
                                        <Select value={newResourceType} onValueChange={(v) => setNewResourceType(v as Resource["type"])}>
                                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {resourceTypeOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleAddResource(dp.id)} className="h-8">
                                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Resource
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setAddingResourceDayId(null)} className="h-8">Cancel</Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="outline" size="sm"
                                      onClick={() => { setAddingResourceDayId(dp.id); setNewResourceType("exercise"); }}
                                      className="h-8 text-sm border-dashed w-full"
                                    >
                                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Resource
                                    </Button>
                                  )}
                                </>
                              )}
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

        <Button variant="outline" onClick={addDay} className="w-full border-dashed h-11">
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
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Download Plan</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport("pdf")}><FileText className="mr-2 h-4 w-4" /> Download as PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("word")}><FileDown className="mr-2 h-4 w-4" /> Download as Word</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={() => navigate("/teacher/setup/concepts")}>
                  Continue to Concepts <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
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
