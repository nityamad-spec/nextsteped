import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  FlaskConical, LibraryBig, ExternalLink, Clock,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
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

type WeekPlan = {
  id: string;
  week: number;
  dates: string;
  topic: string;
  resources: Resource[];
  weightage: number;
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

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const initialPlan: WeekPlan[] = [
  { id: "w1", week: 1, dates: "Jan 13 & 15", topic: "Introduction to OS Concepts & Process Lifecycle", weightage: 5, resources: [
    { id: "r1", title: "Textbook Ch. 1-2", action: "Assign chapters 1-2 as required reading before class", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r2", title: "AICTE Module 1 Guide", action: "Reference AICTE guidelines to align lecture with curriculum standards", type: "textbook", accepted: true, provenance: "uploads" },
  ]},
  { id: "w2", week: 2, dates: "Jan 20 & 22", topic: "Process Scheduling: FCFS, SJF, Round Robin", weightage: 7, resources: [
    { id: "r3", title: "Textbook Ch. 3", action: "Assign chapter 3 as pre-lecture reading on scheduling algorithms", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r4", title: "Scheduling Simulator", action: "Use in a 20-min live demo to visualize FCFS vs Round Robin", type: "exercise", accepted: true, provenance: "uploads" },
    { id: "r5", title: "How Google Redesigned Its Scheduling Algorithm (2024)", action: "Helpful article to read as you prep for this lecture — covers real-world scheduling at scale", type: "article", source: "ACM Queue", accepted: null, provenance: "web" },
  ]},
  { id: "w3", week: 3, dates: "Jan 27 & 29", topic: "Advanced Scheduling & Real-World Applications", weightage: 7, resources: [
    { id: "r6", title: "Scheduling Algorithms Lab", action: "Include a 30-min in-class lab where students implement and compare scheduling algorithms", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r7", title: "Kubernetes Pod Scheduling Under Load", action: "Review this case study as an industry example of how K8s applies CPU scheduling concepts", type: "case-study", accepted: null, provenance: "web" },
  ]},
  { id: "w4", week: 4, dates: "Feb 3 & 5", topic: "Threads & Concurrency Fundamentals", weightage: 7, resources: [
    { id: "r8", title: "Textbook Ch. 4", action: "Assign chapter 4 on threads and concurrency models", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r9", title: "POSIX Threads Tutorial", action: "Share as a hands-on reference for students to practice pthreads outside class", type: "exercise", accepted: true, provenance: "uploads" },
    { id: "r9b", title: "Thread Sanitizer (TSan)", action: "Integrate this tool into your lab setup — students can use it to detect race conditions in their code", type: "exercise", accepted: null, provenance: "web" },
  ]},
  { id: "w5", week: 5, dates: "Feb 10 & 12", topic: "Synchronization: Mutexes, Semaphores, Monitors", weightage: 8, resources: [
    { id: "r10", title: "Textbook Ch. 5", action: "Assign chapter 5 on synchronization primitives", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r11", title: "Producer-Consumer Lab", action: "Run a 30-min hands-on lab implementing the producer-consumer problem", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r12", title: "Race Condition Bug in a Banking App", action: "Use as an interactive debugging exercise — students trace a concurrency bug in a simulated banking system", type: "exercise", accepted: null, provenance: "web" },
  ]},
  { id: "w6", week: 6, dates: "Feb 17 & 19", topic: "Deadlock Prevention & Detection", weightage: 7, resources: [
    { id: "r13", title: "Textbook Ch. 6", action: "Assign chapter 6 on deadlock concepts and prevention strategies", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r14", title: "Deadlock Visualization Tool", action: "Demo in class to visually show how deadlocks form and resolve", type: "exercise", accepted: true, provenance: "uploads" },
    { id: "r15", title: "The 2023 CrowdStrike Kernel Crash", action: "Discuss this real-world case study showing how a kernel-level bug caused global outages", type: "case-study", accepted: null, provenance: "web" },
  ]},
  { id: "w7", week: 7, dates: "Feb 24 & 26", topic: "Midterm Review & Exam", weightage: 10, resources: [
    { id: "r16", title: "Review Sheet", action: "Distribute comprehensive review sheet covering weeks 1-6", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r17", title: "Practice Exam", action: "Assign as a take-home practice exam before the midterm", type: "exercise", accepted: true, provenance: "uploads" },
  ]},
  { id: "w8", week: 8, dates: "Mar 3 & 5", topic: "Physical & Virtual Memory Concepts", weightage: 7, resources: [
    { id: "r18", title: "Textbook Ch. 7", action: "Assign chapter 7 on memory hierarchy and virtual memory basics", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r19", title: "Memory Hierarchy Slides", action: "Use these slides to walk through the memory hierarchy in lecture", type: "textbook", accepted: true, provenance: "uploads" },
  ]},
  { id: "w9", week: 9, dates: "Mar 10 & 12", topic: "Paging, Segmentation & Address Translation", weightage: 7, resources: [
    { id: "r20", title: "Textbook Ch. 8", action: "Assign chapter 8 on paging and segmentation", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r21", title: "Page Table Simulator", action: "Use in a 20-min demo to show address translation step by step", type: "exercise", accepted: true, provenance: "uploads" },
    { id: "r22", title: "Memory Safety in Rust vs C for OS Development", action: "Timely article related to this week's topic — helpful background reading as you prep for lecture", type: "news", source: "The Register", accepted: null, provenance: "web" },
  ]},
  { id: "w10", week: 10, dates: "Mar 17 & 19", topic: "Memory Allocation Strategies", weightage: 5, resources: [
    { id: "r23", title: "Build a Memory Allocator in C", action: "Include a 45-min in-class lab where students implement a basic memory allocator", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r24", title: "Textbook Ch. 9", action: "Assign chapter 9 on memory allocation strategies", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r25", title: "AWS Memory Optimization at Scale", action: "Review this case study on how AWS tunes virtual memory for millions of EC2 instances", type: "case-study", accepted: null, provenance: "web" },
  ]},
  { id: "w11", week: 11, dates: "Mar 24 & 26", topic: "File System Design & Implementation", weightage: 5, resources: [
    { id: "r26", title: "Textbook Ch. 10-11", action: "Assign chapters 10-11 on file system design and implementation", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r27", title: "EXT4 Case Study", action: "Walk through the EXT4 file system as a real-world design example in lecture", type: "case-study", accepted: true, provenance: "uploads" },
    { id: "r28", title: "Building a Mini File System in C", action: "Assign as a coding exercise where students implement a simplified file system with inodes", type: "exercise", accepted: null, provenance: "web" },
  ]},
  { id: "w12", week: 12, dates: "Mar 31 & Apr 2", topic: "Modern Storage: NVMe, SSDs & I/O Systems", weightage: 5, resources: [
    { id: "r29", title: "Industry White Paper", action: "Reference in lecture to provide industry context on modern storage technologies", type: "article", accepted: true, provenance: "uploads" },
    { id: "r30", title: "Storage Benchmark Lab", action: "Run a hands-on lab comparing I/O performance across storage types", type: "lab", accepted: true, provenance: "uploads" },
  ]},
  { id: "w13", week: 13, dates: "Apr 7 & 9", topic: "Security & Protection in Operating Systems", weightage: 5, resources: [
    { id: "r31", title: "Textbook Ch. 14", action: "Assign chapter 14 on OS security and protection mechanisms", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r32", title: "CVE Case Studies", action: "Discuss 2-3 real CVEs in class to illustrate OS vulnerability patterns", type: "case-study", accepted: true, provenance: "uploads" },
    { id: "r33", title: "The Rise of eBPF in Modern Operating Systems", action: "Article on cutting-edge kernel technology — useful background reading for lecture prep", type: "article", source: "LWN.net", accepted: null, provenance: "web" },
  ]},
  { id: "w14", week: 14, dates: "Apr 14 & 16", topic: "Virtualization & Cloud OS Concepts", weightage: 3, resources: [
    { id: "r34", title: "Hypervisor Comparison Article", action: "Use as a reference when discussing Type 1 vs Type 2 hypervisors", type: "article", accepted: true, provenance: "uploads" },
    { id: "r35", title: "Docker Lab", action: "Include a 30-min hands-on lab where students containerize a simple application", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r36", title: "NVIDIA GPU Virtualization Deep Dive", action: "Article on GPU virtualization — helpful context as you prep for the virtualization lecture", type: "article", source: "NVIDIA Dev Blog", accepted: null, provenance: "web" },
  ]},
  { id: "w15", week: 15, dates: "Apr 21 & 23", topic: "Emerging Trends: WASM Runtimes, Unikernels", weightage: 2, resources: [
    { id: "r37", title: "Research Papers", action: "Assign selected papers on WASM runtimes and unikernels for class discussion", type: "article", accepted: true, provenance: "uploads" },
    { id: "r38", title: "Hands-On Demo", action: "Run a live demo of a WASM runtime to make emerging concepts tangible", type: "lab", accepted: true, provenance: "uploads" },
    { id: "r39", title: "MIT 6.S081 xv6 Labs", action: "Share as supplementary practice — students can work through these OS labs independently", type: "exercise", source: "MIT OCW", accepted: null, provenance: "web" },
  ]},
  { id: "w16", week: 16, dates: "Apr 28 & 30", topic: "Final Review & Exam", weightage: 10, resources: [
    { id: "r40", title: "Comprehensive Review", action: "Distribute final review covering all semester topics", type: "textbook", accepted: true, provenance: "uploads" },
    { id: "r41", title: "Practice Final", action: "Assign as a take-home practice exam before the final", type: "exercise", accepted: true, provenance: "uploads" },
  ]},
];

const replacementPool: Omit<Resource, "id">[] = [
  { title: "Netflix Chaos Monkey: Testing OS Resilience", action: "Discuss how Netflix intentionally crashes processes to build resilient systems", type: "case-study", accepted: null, provenance: "web" },
  { title: "Linux OOM Killer in Production", action: "Review real incidents where the Linux Out-of-Memory killer caused unexpected behavior", type: "case-study", accepted: null, provenance: "web" },
  { title: "Apple's Transition to ARM: OS Implications", action: "Article on architecture-level OS changes for Apple Silicon", type: "article", source: "Ars Technica", accepted: null, provenance: "web" },
  { title: "WebAssembly System Interface (WASI) Spec Update", action: "Recent article on emerging OS abstraction layers", type: "news", source: "W3C", accepted: null, provenance: "web" },
  { title: "Valgrind Memory Profiler", action: "Integrate this tool into lab sessions for memory profiling", type: "exercise", accepted: null, provenance: "web" },
  { title: "OS Visualization Toolkit", action: "Use to demo process states, page tables, and scheduling queues", type: "exercise", accepted: null, provenance: "web" },
];

const CourseCreation = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"generating" | "plan">("generating");
  const [genStep, setGenStep] = useState(0);
  const [genElapsed, setGenElapsed] = useState(0);
  const [weeks, setWeeks] = useState<WeekPlan[]>(initialPlan);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [totalWeeks, setTotalWeeks] = useState(16);
  const [classesPerWeek, setClassesPerWeek] = useState(2);
  const [showConfig, setShowConfig] = useState(false);
  const [replacementIdx, setReplacementIdx] = useState(0);
  const [undoStack, setUndoStack] = useState<{ weekId: string; replacementId: string; resource: Resource }[]>([]);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ weeks: false, resources: false, ta: false });
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ weekId: string; resourceId: string; title: string } | null>(null);
  const [suggestionPanel, setSuggestionPanel] = useState<{ weekId: string; resource: Resource } | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ weekId: string; resource: Resource } | null>(null);

  const totalWeightage = weeks.reduce((sum, w) => sum + (w.weightage || 0), 0);

  // Generation progress simulation
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

  const updateWeightage = (weekId: string, value: number) => {
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, weightage: Math.max(0, value) } : w));
    setPublished(false);
  };

  const toggleWeek = (id: string) => {
    setExpandedWeeks((prev) => prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]);
  };

  const startEditWeek = (wp: WeekPlan) => {
    setEditingWeekId(wp.id); setEditTopic(wp.topic); setEditDates(wp.dates);
  };

  const saveEditWeek = () => {
    if (!editingWeekId) return;
    setWeeks((prev) => prev.map((w) => w.id === editingWeekId ? { ...w, topic: editTopic, dates: editDates } : w));
    setEditingWeekId(null); setPublished(false);
  };

  const handleResourceAction = useCallback((weekId: string, resourceId: string, accepted: boolean) => {
    if (accepted) {
      setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: w.resources.map((r) => r.id === resourceId ? { ...r, accepted: true } : r) } : w));
    } else {
      const week = weeks.find((w) => w.id === weekId);
      const resource = week?.resources.find((r) => r.id === resourceId);
      const replacement = replacementPool[replacementIdx % replacementPool.length];
      const newId = makeId();
      if (resource) {
        setUndoStack((prev) => [...prev.slice(-9), { weekId, replacementId: newId, resource: { ...resource } }]);
      }
      setReplacementIdx((i) => i + 1);
      setWeeks((prev) => prev.map((w) => w.id === weekId ? {
        ...w, resources: w.resources.map((r) => r.id === resourceId ? { ...replacement, id: newId, accepted: null } as Resource : r),
      } : w));
    }
    setPublished(false);
  }, [replacementIdx, weeks]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setWeeks((prev) => prev.map((w) => {
      if (w.id !== last.weekId) return w;
      const hasReplacement = w.resources.some((r) => r.id === last.replacementId);
      if (hasReplacement) return { ...w, resources: w.resources.map((r) => r.id === last.replacementId ? last.resource : r) };
      return { ...w, resources: [...w.resources, last.resource] };
    }));
  };

  const confirmRemoveResource = (weekId: string, resourceId: string) => {
    const week = weeks.find((w) => w.id === weekId);
    const resource = week?.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    const isAI = resource.accepted === null;
    if (isAI) {
      handleResourceAction(weekId, resourceId, false);
    } else {
      setRemoveConfirm({ weekId, resourceId, title: resource.title });
    }
  };

  const executeRemove = () => {
    if (!removeConfirm) return;
    const { weekId, resourceId } = removeConfirm;
    const week = weeks.find((w) => w.id === weekId);
    const resource = week?.resources.find((r) => r.id === resourceId);
    if (resource) {
      setLastRemoved({ weekId, resource: { ...resource } });
      setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: w.resources.filter((r) => r.id !== resourceId) } : w));
      setPublished(false);
      toast({
        title: "Resource removed",
        description: resource.title,
        action: (
          <Button variant="outline" size="sm" onClick={() => {
            setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: [...w.resources, resource] } : w));
            setLastRemoved(null);
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

  const saveEditResource = (weekId: string) => {
    if (!editingResourceId) return;
    setWeeks((prev) => prev.map((w) => w.id === weekId ? {
      ...w, resources: w.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction } : r),
    } : w));
    setEditingResourceId(null); setPublished(false);
  };

  const deleteWeek = (id: string) => {
    setWeeks((prev) => prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, week: i + 1 }))); setPublished(false);
  };

  const addWeek = () => {
    const newWeek: WeekPlan = { id: `w_new_${Date.now()}`, week: weeks.length + 1, dates: "TBD", topic: "New Topic", resources: [], weightage: 0 };
    setWeeks((prev) => [...prev, newWeek]);
    setExpandedWeeks((prev) => [...prev, newWeek.id]);
    startEditWeek(newWeek); setPublished(false);
  };

  const addResourceToWeek = (weekId: string, type: Resource["type"]) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type, accepted: true, provenance: "instructor" };
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: [...w.resources, newResource] } : w));
    setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction(""); setPublished(false);
  };

  const handlePublish = () => {
    setPublished(true);
    setPublishTimestamp(new Date().toLocaleString());
    setShowPublishModal(false);
    setPublishChecklist({ weeks: false, resources: false, ta: false });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "AI TEACHING PLAN - Operating Systems\n";
    content += `${totalWeeks} Weeks · ${classesPerWeek} classes/week\n\n`;
    weeks.forEach((w) => {
      content += `Week ${w.week} (${w.dates}): ${w.topic} [${w.weightage}%]\n`;
      w.resources.forEach((r) => {
        const status = r.accepted === true ? "✓" : r.accepted === null ? "★" : "";
        content += `  ${status} [${typeLabels[r.type]}] ${r.title}\n`;
        content += `    → ${r.action}\n`;
      });
      content += "\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "pdf" ? "teaching-plan.pdf" : "teaching-plan.doc";
    a.click();
    URL.revokeObjectURL(url);
  };

  const genSteps = [
    { label: "Reading uploads", desc: "Parsing your syllabus and materials" },
    { label: "Mapping weekly topics", desc: "Aligning with curriculum standards" },
    { label: "Creating resources & activities", desc: "Building exercises, case studies, and readings" },
  ];

  if (phase === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-[640px] text-center space-y-8">
          <div>
            <h1 className="font-heading text-2xl font-bold">Generating your teaching plan</h1>
            <p className="text-sm text-muted-foreground mt-2">Usually takes 30–90 seconds.</p>
          </div>

          {/* 3-step stepper */}
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

  const allChecked = publishChecklist.weeks && publishChecklist.resources && publishChecklist.ta;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-5">
        <SetupProgressBar currentStep={3} />

        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Next<span className="text-primary">Step</span></h1>
        </div>

        {/* Published status */}
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

        {/* Intro */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">AI Teaching Plan</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            We've analyzed your uploaded materials to draft a semester-long teaching plan. Review the weekly breakdown below, accept or replace AI suggestions, and edit as needed.
          </p>
        </div>

        {/* Legend */}
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

        {/* Weightage Summary */}
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-warning/30 bg-warning/5"}`}>
          <span className="text-sm font-medium">Total Weightage:</span>
          <span className={`text-lg font-bold ${totalWeightage === 100 ? "text-primary" : "text-warning"}`}>{totalWeightage}%</span>
          <span className="text-xs text-muted-foreground">/ 100%</span>
          {totalWeightage !== 100 && <span className="text-xs text-warning ml-auto">Adjust week weightages to total 100%</span>}
          {totalWeightage === 100 && <Check className="h-4 w-4 text-primary ml-auto" />}
        </div>

        {/* Teaching Plan subhead with export + undo */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-xl font-semibold">Teaching Plan</h2>
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

        {/* Semester Config */}
        <div className="flex items-center justify-between">
          <button onClick={() => setShowConfig(!showConfig)} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            {showConfig ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Semester Settings
          </button>
          <p className="text-xs text-muted-foreground">{weeks.length} weeks · {classesPerWeek} classes/week</p>
        </div>

        {showConfig && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-4 items-end">
                <div className="space-y-1"><Label className="text-xs">Total Weeks</Label><Input type="number" min={1} max={24} value={totalWeeks} onChange={(e) => setTotalWeeks(Number(e.target.value))} className="w-24 h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Classes / Week</Label><Input type="number" min={1} max={5} value={classesPerWeek} onChange={(e) => setClassesPerWeek(Number(e.target.value))} className="w-24 h-8 text-sm" /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teaching Plan Weeks */}
        <Reorder.Group axis="y" values={weeks} onReorder={(newOrder) => setWeeks(newOrder.map((w, i) => ({ ...w, week: i + 1 })))}>
          <div className="space-y-2">
            {weeks.map((wp) => {
              const isExpanded = expandedWeeks.includes(wp.id);
              const isEditing = editingWeekId === wp.id;
              const aiResources = wp.resources.filter((r) => r.accepted === null);
              const suggestionTypes = aiResources.map((r) => {
                if (r.type === "article" || r.type === "news") return "resource";
                if (r.type === "case-study") return "resource";
                return "resource";
              });
              const suggestionLabel = aiResources.length === 1 ? "1 suggested resource" : `${aiResources.length} suggested resources`;

              return (
                <Reorder.Item key={wp.id} value={wp} className="list-none">
                  <div className="rounded-lg border bg-card shadow-sm">
                    {/* Week Header */}
                    <div className="flex items-center gap-1 px-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                      <button onClick={() => toggleWeek(wp.id)} className="flex flex-1 items-center justify-between px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded" aria-label={`Toggle week ${wp.week}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant="secondary" className="font-mono text-xs shrink-0">W{wp.week}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{wp.topic}</p>
                            <p className="text-xs text-muted-foreground">{wp.dates} · Generated from your course materials</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Weightage inline */}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Input type="number" min={0} max={100} value={wp.weightage} onChange={(e) => updateWeightage(wp.id, parseInt(e.target.value) || 0)} className="h-7 w-14 text-xs text-center" aria-label={`Weightage for week ${wp.week}`} />
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

                    {/* Expanded Content */}
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t px-4 py-3 space-y-3">
                        {isEditing ? (
                          <div className="space-y-2 p-3 rounded-md bg-muted/30 border">
                            <div className="space-y-1"><Label className="text-xs">Topic</Label><Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-8 text-sm" /></div>
                            <div className="space-y-1"><Label className="text-xs">Dates</Label><Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-8 text-sm" /></div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={saveEditWeek} className="h-7 text-xs">Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingWeekId(null)} className="h-7 text-xs">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => startEditWeek(wp)} className="h-7 text-xs" aria-label="Edit week">
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteWeek(wp.id)} className="h-7 text-xs text-destructive hover:text-destructive" aria-label="Remove week">
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </div>
                        )}

                        {/* Resources */}
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Resources & Materials</p>
                          {wp.resources.map((r) => {
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
                                      <Button size="sm" onClick={() => saveEditResource(wp.id)} className="h-6 text-[10px] px-2">Save</Button>
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
                                            <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5" aria-label="View source">
                                              <ExternalLink className="h-2.5 w-2.5" /> {r.source}
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-muted-foreground mt-1 leading-relaxed">{r.action}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                      <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-6 px-2 text-[10px]" aria-label="Edit resource">
                                        <Pencil className="h-3 w-3 mr-1" /> Edit
                                      </Button>
                                      {isAI && (
                                        <Button variant="ghost" size="sm" onClick={() => handleResourceAction(wp.id, r.id, true)} className="h-6 px-2 text-[10px]" aria-label="Accept suggestion">
                                          <ThumbsUp className="h-3 w-3 mr-1" /> Accept
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="sm" onClick={() => confirmRemoveResource(wp.id, r.id)} className="h-6 px-2 text-[10px] text-destructive hover:text-destructive" aria-label="Remove resource">
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
                              <Button key={type} size="sm" variant="outline" onClick={() => addResourceToWeek(wp.id, type)} className="h-7 text-[10px] border-dashed">
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

        {/* Add Week */}
        <Button variant="outline" onClick={addWeek} className="w-full border-dashed">
          <Plus className="mr-2 h-4 w-4" /> Add Week
        </Button>

        {/* Sticky bottom action bar */}
        <div className="sticky bottom-0 bg-background border-t py-4 -mx-4 px-4 flex justify-between items-center z-10">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/quality-check")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={addWeek}>
              <Plus className="mr-1 h-4 w-4" /> Add week
            </Button>
            {!published ? (
              <Button onClick={() => setShowPublishModal(true)}>
                Publish plan & activate Student TA <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate("/teacher/setup/settings")}>
                Configure TA Settings <ArrowRight className="ml-2 h-4 w-4" />
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
            <DialogDescription>Students will see weekly topics, approved resources, and TA practice prompts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={publishChecklist.weeks} onCheckedChange={(v) => setPublishChecklist((p) => ({ ...p, weeks: !!v }))} />
              <span className="text-sm">Weeks and topics look correct</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={publishChecklist.resources} onCheckedChange={(v) => setPublishChecklist((p) => ({ ...p, resources: !!v }))} />
              <span className="text-sm">Resources are appropriate for this cohort</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={publishChecklist.ta} onCheckedChange={(v) => setPublishChecklist((p) => ({ ...p, ta: !!v }))} />
              <span className="text-sm">TA behavior is configured</span>
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
            <DialogDescription>This removes "{removeConfirm?.title}" from this week's plan. You can undo right after.</DialogDescription>
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
