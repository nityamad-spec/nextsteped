import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check, X, ArrowRight, ArrowLeft, Sparkles, Loader2,
  ChevronDown, ChevronUp, ThumbsUp, Download, Pencil, GripVertical,
  BookOpen, Newspaper, Plus, Trash2, Undo2, FileText, FileDown,
  FlaskConical, LibraryBig,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Resource = {
  id: string;
  title: string;
  action: string; // actionable description for the professor
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video";
  source?: string;
  accepted: boolean | null;
};

type WeekPlan = {
  id: string;
  week: number;
  dates: string;
  topic: string;
  resources: Resource[];
};

const typeLabels: Record<string, string> = {
  textbook: "Textbook",
  lab: "Lab",
  "case-study": "Case Study",
  exercise: "Exercise",
  article: "Article & Industry Context",
  news: "Article & Industry Context",
  tool: "Article & Industry Context",
  video: "Video",
};

const typeColors: Record<string, string> = {
  textbook: "bg-secondary text-secondary-foreground",
  lab: "bg-primary/10 text-primary",
  "case-study": "bg-accent/20 text-accent-foreground",
  exercise: "bg-accent/20 text-accent-foreground",
  article: "bg-muted text-muted-foreground",
  news: "bg-muted text-muted-foreground",
  tool: "bg-muted text-muted-foreground",
  video: "bg-destructive/10 text-destructive",
};

const aiTag = "bg-accent/15 text-accent-foreground border border-accent/30";

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const initialPlan: WeekPlan[] = [
  { id: "w1", week: 1, dates: "Jan 13 & 15", topic: "Introduction to OS Concepts & Process Lifecycle", resources: [
    { id: "r1", title: "Textbook Ch. 1-2", action: "Assign chapters 1-2 as required reading before class", type: "textbook", accepted: true },
    { id: "r2", title: "AICTE Module 1 Guide", action: "Reference AICTE guidelines to align lecture with curriculum standards", type: "textbook", accepted: true },
  ]},
  { id: "w2", week: 2, dates: "Jan 20 & 22", topic: "Process Scheduling: FCFS, SJF, Round Robin", resources: [
    { id: "r3", title: "Textbook Ch. 3", action: "Assign chapter 3 as pre-lecture reading on scheduling algorithms", type: "textbook", accepted: true },
    { id: "r4", title: "Scheduling Simulator", action: "Use in a 20-min live demo to visualize FCFS vs Round Robin", type: "tool", accepted: true },
    { id: "r5", title: "How Google Redesigned Its Scheduling Algorithm (2024)", action: "Helpful article to read as you prep for this lecture — covers real-world scheduling at scale", type: "article", source: "ACM Queue", accepted: null },
  ]},
  { id: "w3", week: 3, dates: "Jan 27 & 29", topic: "Advanced Scheduling & Real-World Applications", resources: [
    { id: "r6", title: "Scheduling Algorithms Lab", action: "Include a 30-min in-class lab where students implement and compare scheduling algorithms", type: "lab", accepted: true },
    { id: "r7", title: "Kubernetes Pod Scheduling Under Load", action: "Review this case study as an industry example of how K8s applies CPU scheduling concepts", type: "case-study", accepted: null },
  ]},
  { id: "w4", week: 4, dates: "Feb 3 & 5", topic: "Threads & Concurrency Fundamentals", resources: [
    { id: "r8", title: "Textbook Ch. 4", action: "Assign chapter 4 on threads and concurrency models", type: "textbook", accepted: true },
    { id: "r9", title: "POSIX Threads Tutorial", action: "Share as a hands-on reference for students to practice pthreads outside class", type: "tool", accepted: true },
    { id: "r9b", title: "Thread Sanitizer (TSan)", action: "Integrate this tool into your lab setup — students can use it to detect race conditions in their code", type: "tool", accepted: null },
  ]},
  { id: "w5", week: 5, dates: "Feb 10 & 12", topic: "Synchronization: Mutexes, Semaphores, Monitors", resources: [
    { id: "r10", title: "Textbook Ch. 5", action: "Assign chapter 5 on synchronization primitives", type: "textbook", accepted: true },
    { id: "r11", title: "Producer-Consumer Lab", action: "Run a 30-min hands-on lab implementing the producer-consumer problem", type: "lab", accepted: true },
    { id: "r12", title: "Race Condition Bug in a Banking App", action: "Use as an interactive debugging exercise — students trace a concurrency bug in a simulated banking system", type: "exercise", accepted: null },
  ]},
  { id: "w6", week: 6, dates: "Feb 17 & 19", topic: "Deadlock Prevention & Detection", resources: [
    { id: "r13", title: "Textbook Ch. 6", action: "Assign chapter 6 on deadlock concepts and prevention strategies", type: "textbook", accepted: true },
    { id: "r14", title: "Deadlock Visualization Tool", action: "Demo in class to visually show how deadlocks form and resolve", type: "tool", accepted: true },
    { id: "r15", title: "The 2023 CrowdStrike Kernel Crash", action: "Discuss this real-world case study showing how a kernel-level bug caused global outages", type: "case-study", accepted: null },
  ]},
  { id: "w7", week: 7, dates: "Feb 24 & 26", topic: "Midterm Review & Exam", resources: [
    { id: "r16", title: "Review Sheet", action: "Distribute comprehensive review sheet covering weeks 1-6", type: "textbook", accepted: true },
    { id: "r17", title: "Practice Exam", action: "Assign as a take-home practice exam before the midterm", type: "exercise", accepted: true },
  ]},
  { id: "w8", week: 8, dates: "Mar 3 & 5", topic: "Physical & Virtual Memory Concepts", resources: [
    { id: "r18", title: "Textbook Ch. 7", action: "Assign chapter 7 on memory hierarchy and virtual memory basics", type: "textbook", accepted: true },
    { id: "r19", title: "Memory Hierarchy Slides", action: "Use these slides to walk through the memory hierarchy in lecture", type: "textbook", accepted: true },
  ]},
  { id: "w9", week: 9, dates: "Mar 10 & 12", topic: "Paging, Segmentation & Address Translation", resources: [
    { id: "r20", title: "Textbook Ch. 8", action: "Assign chapter 8 on paging and segmentation", type: "textbook", accepted: true },
    { id: "r21", title: "Page Table Simulator", action: "Use in a 20-min demo to show address translation step by step", type: "tool", accepted: true },
    { id: "r22", title: "Memory Safety in Rust vs C for OS Development", action: "Timely article related to this week's topic — helpful background reading as you prep for lecture", type: "news", source: "The Register", accepted: null },
  ]},
  { id: "w10", week: 10, dates: "Mar 17 & 19", topic: "Memory Allocation Strategies", resources: [
    { id: "r23", title: "Build a Memory Allocator in C", action: "Include a 45-min in-class lab where students implement a basic memory allocator", type: "lab", accepted: true },
    { id: "r24", title: "Textbook Ch. 9", action: "Assign chapter 9 on memory allocation strategies", type: "textbook", accepted: true },
    { id: "r25", title: "AWS Memory Optimization at Scale", action: "Review this case study on how AWS tunes virtual memory for millions of EC2 instances", type: "case-study", accepted: null },
  ]},
  { id: "w11", week: 11, dates: "Mar 24 & 26", topic: "File System Design & Implementation", resources: [
    { id: "r26", title: "Textbook Ch. 10-11", action: "Assign chapters 10-11 on file system design and implementation", type: "textbook", accepted: true },
    { id: "r27", title: "EXT4 Case Study", action: "Walk through the EXT4 file system as a real-world design example in lecture", type: "case-study", accepted: true },
    { id: "r28", title: "Building a Mini File System in C", action: "Assign as a coding exercise where students implement a simplified file system with inodes", type: "exercise", accepted: null },
  ]},
  { id: "w12", week: 12, dates: "Mar 31 & Apr 2", topic: "Modern Storage: NVMe, SSDs & I/O Systems", resources: [
    { id: "r29", title: "Industry White Paper", action: "Reference in lecture to provide industry context on modern storage technologies", type: "article", accepted: true },
    { id: "r30", title: "Storage Benchmark Lab", action: "Run a hands-on lab comparing I/O performance across storage types", type: "lab", accepted: true },
  ]},
  { id: "w13", week: 13, dates: "Apr 7 & 9", topic: "Security & Protection in Operating Systems", resources: [
    { id: "r31", title: "Textbook Ch. 14", action: "Assign chapter 14 on OS security and protection mechanisms", type: "textbook", accepted: true },
    { id: "r32", title: "CVE Case Studies", action: "Discuss 2-3 real CVEs in class to illustrate OS vulnerability patterns", type: "case-study", accepted: true },
    { id: "r33", title: "The Rise of eBPF in Modern Operating Systems", action: "Article on cutting-edge kernel technology — useful background reading for lecture prep", type: "article", source: "LWN.net", accepted: null },
  ]},
  { id: "w14", week: 14, dates: "Apr 14 & 16", topic: "Virtualization & Cloud OS Concepts", resources: [
    { id: "r34", title: "Hypervisor Comparison Article", action: "Use as a reference when discussing Type 1 vs Type 2 hypervisors", type: "article", accepted: true },
    { id: "r35", title: "Docker Lab", action: "Include a 30-min hands-on lab where students containerize a simple application", type: "lab", accepted: true },
    { id: "r36", title: "NVIDIA GPU Virtualization Deep Dive", action: "Article on GPU virtualization — helpful context as you prep for the virtualization lecture", type: "article", source: "NVIDIA Dev Blog", accepted: null },
  ]},
  { id: "w15", week: 15, dates: "Apr 21 & 23", topic: "Emerging Trends: WASM Runtimes, Unikernels", resources: [
    { id: "r37", title: "Research Papers", action: "Assign selected papers on WASM runtimes and unikernels for class discussion", type: "article", accepted: true },
    { id: "r38", title: "Hands-On Demo", action: "Run a live demo of a WASM runtime to make emerging concepts tangible", type: "lab", accepted: true },
    { id: "r39", title: "MIT 6.S081 xv6 Labs", action: "Share as supplementary practice — students can work through these OS labs independently", type: "tool", source: "MIT OCW", accepted: null },
  ]},
  { id: "w16", week: 16, dates: "Apr 28 & 30", topic: "Final Review & Exam", resources: [
    { id: "r40", title: "Comprehensive Review", action: "Distribute final review covering all semester topics", type: "textbook", accepted: true },
    { id: "r41", title: "Practice Final", action: "Assign as a take-home practice exam before the final", type: "exercise", accepted: true },
  ]},
];

const replacementPool: Omit<Resource, "id">[] = [
  { title: "Netflix Chaos Monkey: Testing OS Resilience", action: "Discuss how Netflix intentionally crashes processes to build resilient systems — great case study for deadlock/recovery topics", type: "case-study", accepted: null },
  { title: "Linux OOM Killer in Production", action: "Review real incidents where the Linux Out-of-Memory killer caused unexpected behavior — ties into memory management", type: "case-study", accepted: null },
  { title: "Apple's Transition to ARM: OS Implications", action: "Article on architecture-level OS changes for Apple Silicon — helpful lecture prep reading", type: "article", source: "Ars Technica", accepted: null },
  { title: "WebAssembly System Interface (WASI) Spec Update", action: "Recent article on emerging OS abstraction layers — useful context for WASM runtimes discussion", type: "news", source: "W3C", accepted: null },
  { title: "Valgrind Memory Profiler", action: "Integrate this tool into lab sessions — students can profile memory usage and detect leaks in their C programs", type: "tool", accepted: null },
  { title: "OS Visualization Toolkit", action: "Use this interactive tool to demo process states, page tables, and scheduling queues in class", type: "tool", accepted: null },
];

const CourseCreation = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"generating" | "plan">("generating");
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

  // Auto-advance from generating
  useState(() => {
    setTimeout(() => setPhase("plan"), 2500);
  });

  const toggleWeek = (id: string) => {
    setExpandedWeeks((prev) => prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]);
  };

  const startEditWeek = (wp: WeekPlan) => {
    setEditingWeekId(wp.id);
    setEditTopic(wp.topic);
    setEditDates(wp.dates);
  };

  const saveEditWeek = () => {
    if (!editingWeekId) return;
    setWeeks((prev) => prev.map((w) => w.id === editingWeekId ? { ...w, topic: editTopic, dates: editDates } : w));
    setEditingWeekId(null);
  };

  const handleResourceAction = useCallback((weekId: string, resourceId: string, accepted: boolean) => {
    if (accepted) {
      setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: w.resources.map((r) => r.id === resourceId ? { ...r, accepted: true } : r) } : w));
    } else {
      // Save to undo stack before replacing
      const week = weeks.find((w) => w.id === weekId);
      const resource = week?.resources.find((r) => r.id === resourceId);
      const replacement = replacementPool[replacementIdx % replacementPool.length];
      const newId = makeId();
      if (resource) {
        setUndoStack((prev) => [...prev.slice(-9), { weekId, replacementId: newId, resource: { ...resource } }]);
      }
      setReplacementIdx((i) => i + 1);
      setWeeks((prev) => prev.map((w) => w.id === weekId ? {
        ...w,
        resources: w.resources.map((r) => r.id === resourceId ? { ...replacement, id: newId, accepted: null } : r),
      } : w));
    }
  }, [replacementIdx, weeks]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setWeeks((prev) => prev.map((w) => {
      if (w.id !== last.weekId) return w;
      return { ...w, resources: w.resources.map((r) => r.id === last.replacementId ? last.resource : r) };
    }));
  };

  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id);
    setEditResourceTitle(r.title);
    setEditResourceAction(r.action);
  };

  const saveEditResource = (weekId: string) => {
    if (!editingResourceId) return;
    setWeeks((prev) => prev.map((w) => w.id === weekId ? {
      ...w,
      resources: w.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction } : r),
    } : w));
    setEditingResourceId(null);
  };

  const deleteWeek = (id: string) => {
    setWeeks((prev) => prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, week: i + 1 })));
  };

  const addWeek = () => {
    const newWeek: WeekPlan = {
      id: `w_new_${Date.now()}`,
      week: weeks.length + 1,
      dates: "TBD",
      topic: "New Topic",
      resources: [],
    };
    setWeeks((prev) => [...prev, newWeek]);
    setExpandedWeeks((prev) => [...prev, newWeek.id]);
    startEditWeek(newWeek);
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "AI TEACHING PLAN - Operating Systems\n";
    content += `${totalWeeks} Weeks · ${classesPerWeek} classes/week\n\n`;
    weeks.forEach((w) => {
      content += `Week ${w.week} (${w.dates}): ${w.topic}\n`;
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
    a.download = format === "pdf" ? "lesson-plan.pdf" : "lesson-plan.doc";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (phase === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Generating your AI Teaching Plan...</p>
          <p className="text-sm text-muted-foreground mt-1">Analyzing your syllabus, guidelines, and teaching materials</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-5">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">
            Next<span className="text-primary">Step</span>
          </h1>
        </div>

        {/* Intro */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">AI Teaching Plan</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            We've analyzed your uploaded materials to draft a semester-long lesson plan. Review the weekly breakdown below, accept or replace AI suggestions, and edit as needed.
          </p>
        </div>

        {/* Action types legend */}
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

        {/* Lesson Plan subhead with export + undo */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-xl font-semibold">Lesson Plan</h2>
          <div className="flex items-center gap-2">
            {undoStack.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleUndo} className="text-xs">
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Plan
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="mr-2 h-4 w-4" /> Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("word")}>
                  <FileDown className="mr-2 h-4 w-4" /> Export as Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Semester Config — under Lesson Plan */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showConfig ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Semester Settings
          </button>
          <p className="text-xs text-muted-foreground">{weeks.length} weeks · {classesPerWeek} classes/week</p>
        </div>

        {showConfig && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-4 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Total Weeks</Label>
                  <Input type="number" min={1} max={24} value={totalWeeks} onChange={(e) => setTotalWeeks(Number(e.target.value))} className="w-24 h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Classes / Week</Label>
                  <Input type="number" min={1} max={5} value={classesPerWeek} onChange={(e) => setClassesPerWeek(Number(e.target.value))} className="w-24 h-8 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lesson Plan Weeks */}
        <Reorder.Group axis="y" values={weeks} onReorder={(newOrder) => setWeeks(newOrder.map((w, i) => ({ ...w, week: i + 1 })))}>
          <div className="space-y-2">
            {weeks.map((wp) => {
              const isExpanded = expandedWeeks.includes(wp.id);
              const isEditing = editingWeekId === wp.id;
              const aiResources = wp.resources.filter((r) => r.accepted === null);
              return (
                <Reorder.Item key={wp.id} value={wp} className="list-none">
                  <div className="rounded-lg border bg-card shadow-sm">
                    {/* Week Header */}
                    <div className="flex items-center gap-1 px-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                      <button
                        onClick={() => toggleWeek(wp.id)}
                        className="flex flex-1 items-center justify-between px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant="secondary" className="font-mono text-xs shrink-0">W{wp.week}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{wp.topic}</p>
                            <p className="text-xs text-muted-foreground">{wp.dates}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {aiResources.length > 0 && (
                            <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 border font-medium">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />{aiResources.length} suggestion{aiResources.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="border-t px-4 py-3 space-y-3"
                      >
                        {/* Edit week mode */}
                        {isEditing ? (
                          <div className="space-y-2 p-3 rounded-md bg-muted/30 border">
                            <div className="space-y-1">
                              <Label className="text-xs">Topic</Label>
                              <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Dates</Label>
                              <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-8 text-sm" />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={saveEditWeek} className="h-7 text-xs">Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingWeekId(null)} className="h-7 text-xs">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => startEditWeek(wp)} className="h-7 text-xs">
                              <Pencil className="h-3 w-3 mr-1" /> Edit Week
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteWeek(wp.id)} className="h-7 text-xs text-destructive hover:text-destructive">
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
                            return (
                              <div
                                key={r.id}
                                className={`rounded-md px-3 py-2.5 text-xs border ${
                                  isAI ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                                }`}
                              >
                                {isEditingThis ? (
                                  <div className="space-y-2">
                                    <div className="space-y-1">
                                      <Label className="text-[10px]">Title</Label>
                                      <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-7 text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[10px]">Action / Description</Label>
                                      <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} className="h-7 text-xs" />
                                    </div>
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
                                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${typeColors[r.type] || "bg-muted text-muted-foreground"}`}>
                                            {typeLabels[r.type]}
                                          </span>
                                          <span className="font-medium">{r.title}</span>
                                          {r.source && <span className="text-muted-foreground">· {r.source}</span>}
                                        </div>
                                        <p className="text-muted-foreground mt-1 leading-relaxed">{r.action}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                      <button
                                        onClick={() => startEditResource(r)}
                                        className="rounded p-1 hover:bg-muted transition-colors"
                                        title="Edit resource"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      {isAI && (
                                        <>
                                          <button
                                            onClick={() => handleResourceAction(wp.id, r.id, true)}
                                            className="rounded p-1 hover:bg-primary/10 transition-colors"
                                            title="Accept"
                                          >
                                            <ThumbsUp className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={() => handleResourceAction(wp.id, r.id, false)}
                                            className="rounded p-1 hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            title="Replace"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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

        {/* Navigation */}
        <div className="flex justify-between pb-8">
          <Button variant="ghost" onClick={() => navigate("/teacher/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => navigate("/teacher/setup/settings")}>
            Configure AI TA Settings <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CourseCreation;
