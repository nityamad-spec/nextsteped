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
  BookOpen, Newspaper, Plus, Trash2,
} from "lucide-react";

type Resource = {
  id: string;
  title: string;
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
  article: "Article",
  news: "News",
  tool: "Tool",
  video: "Video",
};

const typeColors: Record<string, string> = {
  textbook: "bg-secondary text-secondary-foreground",
  lab: "bg-primary/10 text-primary",
  "case-study": "bg-accent/20 text-accent-foreground",
  exercise: "bg-accent/20 text-accent-foreground",
  article: "bg-muted text-muted-foreground",
  news: "bg-muted text-muted-foreground",
  tool: "bg-primary/10 text-primary",
  video: "bg-destructive/10 text-destructive",
};

const aiTag = "bg-accent/15 text-accent-foreground border border-accent/30";

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const initialPlan: WeekPlan[] = [
  { id: "w1", week: 1, dates: "Jan 13 & 15", topic: "Introduction to OS Concepts & Process Lifecycle", resources: [
    { id: "r1", title: "Textbook Ch. 1-2", type: "textbook", accepted: true },
    { id: "r2", title: "AICTE Module 1 Guide", type: "textbook", accepted: true },
  ]},
  { id: "w2", week: 2, dates: "Jan 20 & 22", topic: "Process Scheduling: FCFS, SJF, Round Robin", resources: [
    { id: "r3", title: "Textbook Ch. 3", type: "textbook", accepted: true },
    { id: "r4", title: "Scheduling Simulator", type: "tool", accepted: true },
    { id: "r5", title: "How Google Redesigned Its Scheduling Algorithm (2024)", type: "article", source: "ACM Queue", accepted: null },
  ]},
  { id: "w3", week: 3, dates: "Jan 27 & 29", topic: "Advanced Scheduling & Real-World Applications", resources: [
    { id: "r6", title: "Lab: Scheduling Algorithms", type: "lab", accepted: true },
    { id: "r7", title: "Kubernetes Pod Scheduling Under Load", type: "case-study", accepted: null },
  ]},
  { id: "w4", week: 4, dates: "Feb 3 & 5", topic: "Threads & Concurrency Fundamentals", resources: [
    { id: "r8", title: "Textbook Ch. 4", type: "textbook", accepted: true },
    { id: "r9", title: "POSIX Threads Tutorial", type: "tool", accepted: true },
  ]},
  { id: "w5", week: 5, dates: "Feb 10 & 12", topic: "Synchronization: Mutexes, Semaphores, Monitors", resources: [
    { id: "r10", title: "Textbook Ch. 5", type: "textbook", accepted: true },
    { id: "r11", title: "Producer-Consumer Lab", type: "lab", accepted: true },
    { id: "r12", title: "Race Condition Bug in a Banking App", type: "exercise", accepted: null },
  ]},
  { id: "w6", week: 6, dates: "Feb 17 & 19", topic: "Deadlock Prevention & Detection", resources: [
    { id: "r13", title: "Textbook Ch. 6", type: "textbook", accepted: true },
    { id: "r14", title: "Deadlock Visualization Tool", type: "tool", accepted: true },
    { id: "r15", title: "The 2023 CrowdStrike Kernel Crash", type: "case-study", accepted: null },
  ]},
  { id: "w7", week: 7, dates: "Feb 24 & 26", topic: "Midterm Review & Exam", resources: [
    { id: "r16", title: "Review Sheet", type: "textbook", accepted: true },
    { id: "r17", title: "Practice Exam", type: "exercise", accepted: true },
  ]},
  { id: "w8", week: 8, dates: "Mar 3 & 5", topic: "Physical & Virtual Memory Concepts", resources: [
    { id: "r18", title: "Textbook Ch. 7", type: "textbook", accepted: true },
    { id: "r19", title: "Memory Hierarchy Slides", type: "textbook", accepted: true },
  ]},
  { id: "w9", week: 9, dates: "Mar 10 & 12", topic: "Paging, Segmentation & Address Translation", resources: [
    { id: "r20", title: "Textbook Ch. 8", type: "textbook", accepted: true },
    { id: "r21", title: "Page Table Simulator", type: "tool", accepted: true },
    { id: "r22", title: "Memory Safety in Rust vs C for OS Development", type: "news", source: "The Register", accepted: null },
  ]},
  { id: "w10", week: 10, dates: "Mar 17 & 19", topic: "Memory Allocation Strategies", resources: [
    { id: "r23", title: "Lab: Build a Memory Allocator in C", type: "lab", accepted: true },
    { id: "r24", title: "Textbook Ch. 9", type: "textbook", accepted: true },
    { id: "r25", title: "AWS Memory Optimization at Scale", type: "case-study", accepted: null },
  ]},
  { id: "w11", week: 11, dates: "Mar 24 & 26", topic: "File System Design & Implementation", resources: [
    { id: "r26", title: "Textbook Ch. 10-11", type: "textbook", accepted: true },
    { id: "r27", title: "EXT4 Case Study", type: "case-study", accepted: true },
    { id: "r28", title: "Building a Mini File System in C", type: "exercise", accepted: null },
  ]},
  { id: "w12", week: 12, dates: "Mar 31 & Apr 2", topic: "Modern Storage: NVMe, SSDs & I/O Systems", resources: [
    { id: "r29", title: "Industry White Paper", type: "article", accepted: true },
    { id: "r30", title: "Storage Benchmark Lab", type: "lab", accepted: true },
  ]},
  { id: "w13", week: 13, dates: "Apr 7 & 9", topic: "Security & Protection in Operating Systems", resources: [
    { id: "r31", title: "Textbook Ch. 14", type: "textbook", accepted: true },
    { id: "r32", title: "CVE Case Studies", type: "case-study", accepted: true },
    { id: "r33", title: "The Rise of eBPF in Modern Operating Systems", type: "article", source: "LWN.net", accepted: null },
  ]},
  { id: "w14", week: 14, dates: "Apr 14 & 16", topic: "Virtualization & Cloud OS Concepts", resources: [
    { id: "r34", title: "Hypervisor Comparison Article", type: "article", accepted: true },
    { id: "r35", title: "Docker Lab", type: "lab", accepted: true },
    { id: "r36", title: "NVIDIA GPU Virtualization Deep Dive", type: "article", source: "NVIDIA Dev Blog", accepted: null },
  ]},
  { id: "w15", week: 15, dates: "Apr 21 & 23", topic: "Emerging Trends: WASM Runtimes, Unikernels", resources: [
    { id: "r37", title: "Research Papers", type: "article", accepted: true },
    { id: "r38", title: "Hands-On Demo", type: "lab", accepted: true },
    { id: "r39", title: "MIT 6.S081 xv6 Labs", type: "tool", source: "MIT OCW", accepted: null },
  ]},
  { id: "w16", week: 16, dates: "Apr 28 & 30", topic: "Final Review & Exam", resources: [
    { id: "r40", title: "Comprehensive Review", type: "textbook", accepted: true },
    { id: "r41", title: "Practice Final", type: "exercise", accepted: true },
  ]},
];

const replacementPool: Omit<Resource, "id">[] = [
  { title: "Netflix Chaos Monkey: Testing OS Resilience", type: "case-study", accepted: null },
  { title: "Linux OOM Killer in Production", type: "case-study", accepted: null },
  { title: "Apple's Transition to ARM: OS Implications", type: "article", source: "Ars Technica", accepted: null },
  { title: "WebAssembly System Interface (WASI) Spec Update", type: "news", source: "W3C", accepted: null },
];

const CourseCreation = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"generating" | "plan">("generating");
  const [weeks, setWeeks] = useState<WeekPlan[]>(initialPlan);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>(["w1"]);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [totalWeeks, setTotalWeeks] = useState(16);
  const [classesPerWeek, setClassesPerWeek] = useState(2);
  const [showConfig, setShowConfig] = useState(false);
  const [replacementIdx, setReplacementIdx] = useState(0);

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
      const replacement = replacementPool[replacementIdx % replacementPool.length];
      setReplacementIdx((i) => i + 1);
      setWeeks((prev) => prev.map((w) => w.id === weekId ? {
        ...w,
        resources: w.resources.map((r) => r.id === resourceId ? { ...replacement, id: makeId(), accepted: null } : r),
      } : w));
    }
  }, [replacementIdx]);

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

  const handleExport = () => {
    let content = "AI TEACHING PLAN - Operating Systems\n";
    content += `${totalWeeks} Weeks · ${classesPerWeek} classes/week\n\n`;
    weeks.forEach((w) => {
      content += `Week ${w.week} (${w.dates}): ${w.topic}\n`;
      w.resources.forEach((r) => {
        const status = r.accepted === true ? "✓" : r.accepted === null ? "AI" : "";
        content += `  ${status} [${typeLabels[r.type]}] ${r.title}${r.source ? ` (${r.source})` : ""}\n`;
      });
      content += "\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson-plan.txt";
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

  const aiResourceCount = weeks.reduce((acc, w) => acc + w.resources.filter((r) => r.accepted === null).length, 0);

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-5">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">
            Next<span className="text-primary">Step</span>
          </h1>
        </div>

        {/* Intro Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl">AI Teaching Plan</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              We've analyzed your uploaded materials to draft a semester lesson plan.
              {aiResourceCount > 0 && (
                <span className="ml-1">Review <Badge variant="secondary" className="text-xs mx-1">{aiResourceCount}</Badge> AI-suggested resources below.</span>
              )}
            </p>
          </CardHeader>
        </Card>

        {/* Semester Config */}
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

        {/* Lesson Plan */}
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
                            <Badge className={`text-[10px] ${aiTag}`}>
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
                        {/* Edit mode */}
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
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Resources & Materials</p>
                          {wp.resources.map((r) => {
                            const isAI = r.accepted === null;
                            return (
                              <div
                                key={r.id}
                                className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs border ${
                                  isAI ? "border-accent/30 bg-accent/5" : r.accepted ? "border-border bg-background" : "border-border bg-background"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {isAI && <Sparkles className="h-3 w-3 text-primary shrink-0" />}
                                  {r.accepted === true && <Check className="h-3 w-3 text-primary shrink-0" />}
                                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${typeColors[r.type] || "bg-muted text-muted-foreground"}`}>
                                    {typeLabels[r.type]}
                                  </span>
                                  <span className="truncate">{r.title}</span>
                                  {r.source && <span className="text-muted-foreground shrink-0">· {r.source}</span>}
                                </div>
                                {isAI && (
                                  <div className="flex gap-1 shrink-0">
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
