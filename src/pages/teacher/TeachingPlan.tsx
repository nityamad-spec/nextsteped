import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronDown, ChevronUp, Pencil, Trash2, Plus, Upload, FileText,
  Check, X, BookOpen, FlaskConical, Newspaper, LibraryBig, FileDown,
  Presentation, FileSpreadsheet, Download,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Resource = {
  id: string;
  title: string;
  action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video";
  source?: string;
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
  textbook: "Textbook",
  exercise: "Interactive Exercise",
  lab: "Interactive Exercise",
  tool: "Interactive Exercise",
  "case-study": "Case Study",
  article: "Article & Industry Context",
  news: "Article & Industry Context",
  video: "Video",
};

const typeColors: Record<string, string> = {
  textbook: "bg-secondary text-secondary-foreground",
  exercise: "bg-primary/10 text-primary",
  lab: "bg-primary/10 text-primary",
  tool: "bg-primary/10 text-primary",
  "case-study": "bg-accent/20 text-accent-foreground",
  article: "bg-muted text-muted-foreground",
  news: "bg-muted text-muted-foreground",
  video: "bg-destructive/10 text-destructive",
};

const typeIcons: Record<string, typeof BookOpen> = {
  textbook: BookOpen,
  exercise: FlaskConical,
  lab: FlaskConical,
  tool: FlaskConical,
  "case-study": LibraryBig,
  article: Newspaper,
  news: Newspaper,
  video: BookOpen,
};

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Same initial plan from setup (accepted resources only — representing the confirmed plan)
const confirmedPlan: WeekPlan[] = [
  { id: "w1", week: 1, dates: "Jan 13 & 15", topic: "Introduction to OS Concepts & Process Lifecycle", weightage: 5, resources: [
    { id: "r1", title: "Textbook Ch. 1-2", action: "Assign chapters 1-2 as required reading before class", type: "textbook" },
    { id: "r2", title: "AICTE Module 1 Guide", action: "Reference AICTE guidelines to align lecture with curriculum standards", type: "textbook" },
  ]},
  { id: "w2", week: 2, dates: "Jan 20 & 22", topic: "Process Scheduling: FCFS, SJF, Round Robin", weightage: 7, resources: [
    { id: "r3", title: "Textbook Ch. 3", action: "Assign chapter 3 as pre-lecture reading on scheduling algorithms", type: "textbook" },
    { id: "r4", title: "Scheduling Simulator", action: "Use in a 20-min live demo to visualize FCFS vs Round Robin", type: "exercise" },
  ]},
  { id: "w3", week: 3, dates: "Jan 27 & 29", topic: "Advanced Scheduling & Real-World Applications", weightage: 7, resources: [
    { id: "r6", title: "Scheduling Algorithms Lab", action: "Include a 30-min in-class lab where students implement and compare scheduling algorithms", type: "lab" },
  ]},
  { id: "w4", week: 4, dates: "Feb 3 & 5", topic: "Threads & Concurrency Fundamentals", weightage: 7, resources: [
    { id: "r8", title: "Textbook Ch. 4", action: "Assign chapter 4 on threads and concurrency models", type: "textbook" },
    { id: "r9", title: "POSIX Threads Tutorial", action: "Share as a hands-on reference for students to practice pthreads outside class", type: "exercise" },
  ]},
  { id: "w5", week: 5, dates: "Feb 10 & 12", topic: "Synchronization: Mutexes, Semaphores, Monitors", weightage: 8, resources: [
    { id: "r10", title: "Textbook Ch. 5", action: "Assign chapter 5 on synchronization primitives", type: "textbook" },
    { id: "r11", title: "Producer-Consumer Lab", action: "Run a 30-min hands-on lab implementing the producer-consumer problem", type: "lab" },
  ]},
  { id: "w6", week: 6, dates: "Feb 17 & 19", topic: "Deadlock Prevention & Detection", weightage: 7, resources: [
    { id: "r13", title: "Textbook Ch. 6", action: "Assign chapter 6 on deadlock concepts and prevention strategies", type: "textbook" },
    { id: "r14", title: "Deadlock Visualization Tool", action: "Demo in class to visually show how deadlocks form and resolve", type: "exercise" },
  ]},
  { id: "w7", week: 7, dates: "Feb 24 & 26", topic: "Midterm Review & Exam", weightage: 10, resources: [
    { id: "r16", title: "Review Sheet", action: "Distribute comprehensive review sheet covering weeks 1-6", type: "textbook" },
    { id: "r17", title: "Practice Exam", action: "Assign as a take-home practice exam before the midterm", type: "exercise" },
  ]},
  { id: "w8", week: 8, dates: "Mar 3 & 5", topic: "Physical & Virtual Memory Concepts", weightage: 7, resources: [
    { id: "r18", title: "Textbook Ch. 7", action: "Assign chapter 7 on memory hierarchy and virtual memory basics", type: "textbook" },
    { id: "r19", title: "Memory Hierarchy Slides", action: "Use these slides to walk through the memory hierarchy in lecture", type: "textbook" },
  ]},
  { id: "w9", week: 9, dates: "Mar 10 & 12", topic: "Paging, Segmentation & Address Translation", weightage: 7, resources: [
    { id: "r20", title: "Textbook Ch. 8", action: "Assign chapter 8 on paging and segmentation", type: "textbook" },
    { id: "r21", title: "Page Table Simulator", action: "Use in a 20-min demo to show address translation step by step", type: "exercise" },
  ]},
  { id: "w10", week: 10, dates: "Mar 17 & 19", topic: "Memory Allocation Strategies", weightage: 5, resources: [
    { id: "r23", title: "Build a Memory Allocator in C", action: "Include a 45-min in-class lab where students implement a basic memory allocator", type: "lab" },
    { id: "r24", title: "Textbook Ch. 9", action: "Assign chapter 9 on memory allocation strategies", type: "textbook" },
  ]},
  { id: "w11", week: 11, dates: "Mar 24 & 26", topic: "File System Design & Implementation", weightage: 5, resources: [
    { id: "r26", title: "Textbook Ch. 10-11", action: "Assign chapters 10-11 on file system design and implementation", type: "textbook" },
    { id: "r27", title: "EXT4 Case Study", action: "Walk through the EXT4 file system as a real-world design example in lecture", type: "case-study" },
  ]},
  { id: "w12", week: 12, dates: "Mar 31 & Apr 2", topic: "Modern Storage: NVMe, SSDs & I/O Systems", weightage: 5, resources: [
    { id: "r29", title: "Industry White Paper", action: "Reference in lecture to provide industry context on modern storage technologies", type: "article" },
    { id: "r30", title: "Storage Benchmark Lab", action: "Run a hands-on lab comparing I/O performance across storage types", type: "lab" },
  ]},
  { id: "w13", week: 13, dates: "Apr 7 & 9", topic: "Security & Protection in Operating Systems", weightage: 5, resources: [
    { id: "r31", title: "Textbook Ch. 14", action: "Assign chapter 14 on OS security and protection mechanisms", type: "textbook" },
    { id: "r32", title: "CVE Case Studies", action: "Discuss 2-3 real CVEs in class to illustrate OS vulnerability patterns", type: "case-study" },
  ]},
  { id: "w14", week: 14, dates: "Apr 14 & 16", topic: "Virtualization & Cloud OS Concepts", weightage: 3, resources: [
    { id: "r34", title: "Hypervisor Comparison Article", action: "Use as a reference when discussing Type 1 vs Type 2 hypervisors", type: "article" },
    { id: "r35", title: "Docker Lab", action: "Include a 30-min hands-on lab where students containerize a simple application", type: "lab" },
  ]},
  { id: "w15", week: 15, dates: "Apr 21 & 23", topic: "Emerging Trends: WASM Runtimes, Unikernels", weightage: 2, resources: [
    { id: "r37", title: "Research Papers", action: "Assign selected papers on WASM runtimes and unikernels for class discussion", type: "article" },
    { id: "r38", title: "Hands-On Demo", action: "Run a live demo of a WASM runtime to make emerging concepts tangible", type: "lab" },
  ]},
  { id: "w16", week: 16, dates: "Apr 28 & 30", topic: "Final Review & Exam", weightage: 10, resources: [
    { id: "r40", title: "Comprehensive Review", action: "Distribute final review covering all semester topics", type: "textbook" },
    { id: "r41", title: "Practice Final", action: "Assign as a take-home practice exam before the final", type: "exercise" },
  ]},
];

const TeachingPlan = () => {
  const [weeks, setWeeks] = useState<WeekPlan[]>(confirmedPlan);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [approved, setApproved] = useState(false);

  const markChanged = () => { setHasChanges(true); setApproved(false); };

  const totalWeightage = weeks.reduce((sum, w) => sum + (w.weightage || 0), 0);

  const updateWeightage = (weekId: string, value: number) => {
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, weightage: Math.max(0, value) } : w));
    markChanged();
  };

  const toggleWeek = (id: string) => {
    setExpandedWeeks((prev) => prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]);
  };

  const startEditWeek = (wp: WeekPlan) => {
    setEditingWeekId(wp.id);
    setEditTopic(wp.topic);
    setEditDates(wp.dates);
    if (!expandedWeeks.includes(wp.id)) toggleWeek(wp.id);
  };

  const saveEditWeek = () => {
    if (!editingWeekId) return;
    setWeeks((prev) => prev.map((w) => w.id === editingWeekId ? { ...w, topic: editTopic, dates: editDates } : w));
    setEditingWeekId(null);
    markChanged();
  };

  const deleteWeek = (id: string) => {
    setWeeks((prev) => prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, week: i + 1 }))); markChanged();
  };

  const addWeek = () => {
    const newWeek: WeekPlan = {
      id: `w_new_${Date.now()}`,
      week: weeks.length + 1,
      dates: "TBD",
      topic: "New Topic",
      resources: [],
      weightage: 0,
    };
    setWeeks((prev) => [...prev, newWeek]); markChanged();
    setExpandedWeeks((prev) => [...prev, newWeek.id]);
    startEditWeek(newWeek);
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
    markChanged();
  };

  const deleteResource = (weekId: string, resourceId: string) => {
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: w.resources.filter((r) => r.id !== resourceId) } : w)); markChanged();
  };

  const addResourceToWeek = (weekId: string, type: Resource["type"]) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type };
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: [...w.resources, newResource] } : w)); markChanged();
    setEditingResourceId(newResource.id);
    setEditResourceTitle("");
    setEditResourceAction("");
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "TEACHING PLAN - Operating Systems\n";
    content += `${weeks.length} Weeks\n\n`;
    weeks.forEach((w) => {
      content += `Week ${w.week} (${w.dates}): ${w.topic}\n`;
      w.resources.forEach((r) => {
        content += `  [${typeLabels[r.type]}] ${r.title}\n`;
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

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Teaching Plan</h1>
          <p className="text-muted-foreground">Your confirmed semester plan — edit topics, resources, and materials</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileDown className="mr-1 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>Export as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("word")}>Export as Word</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant={approved ? "default" : "outline"} onClick={() => { setApproved(!approved); setHasChanges(false); }}>
            <Check className="mr-1 h-4 w-4" /> {approved ? "Approved ✓" : "Approve Plan"}
          </Button>
          <Button size="sm" onClick={addWeek}>
            <Plus className="mr-1 h-4 w-4" /> Add Week
          </Button>
        </div>
      </div>

      {/* Weightage Summary */}
      <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-warning/30 bg-warning/5"}`}>
        <span className="text-sm font-medium">Total Weightage:</span>
        <span className={`text-lg font-bold ${totalWeightage === 100 ? "text-primary" : "text-warning"}`}>{totalWeightage}%</span>
        <span className="text-xs text-muted-foreground">/ 100%</span>
        {totalWeightage !== 100 && (
          <span className="text-xs text-warning ml-auto">Adjust week weightages to total 100%</span>
        )}
        {totalWeightage === 100 && (
          <Check className="h-4 w-4 text-primary ml-auto" />
        )}
      </div>

      <Tabs defaultValue="plan" className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="plan">Weekly Plan</TabsTrigger>
          <TabsTrigger value="materials">Uploaded Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5" /> Course Materials</CardTitle>
                  <CardDescription>Syllabus, slides, problem sets, and other teaching materials</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" /> Upload New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: "CS301_Syllabus_Fall2025.pdf", type: "Syllabus", size: "2.4 MB", date: "Aug 10, 2025", icon: FileText },
                { name: "Module1_Process_Management_Slides.pptx", type: "Slides", size: "8.1 MB", date: "Aug 10, 2025", icon: Presentation },
                { name: "Module2_Memory_Management_Slides.pptx", type: "Slides", size: "6.7 MB", date: "Aug 10, 2025", icon: Presentation },
                { name: "Past_Midterm_Exam_2024.pdf", type: "Past Exam", size: "1.2 MB", date: "Aug 10, 2025", icon: FileText },
                { name: "Problem_Set_1_Scheduling.pdf", type: "Problem Set", size: "540 KB", date: "Aug 10, 2025", icon: FileSpreadsheet },
                { name: "Textbook_Readings_Ch1-4.pdf", type: "Reading", size: "15.3 MB", date: "Aug 10, 2025", icon: BookOpen },
              ].map((file, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <file.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.type} • {file.size} • Uploaded {file.date}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="space-y-2">
        {weeks.map((wp) => {
          const isExpanded = expandedWeeks.includes(wp.id);
          const isEditing = editingWeekId === wp.id;

          return (
            <Card key={wp.id}>
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggleWeek(wp.id)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant="outline" className="shrink-0 text-xs">Week {wp.week}</Badge>
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-7 w-28 text-xs" />
                      <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-7 flex-1 text-xs" />
                      <button onClick={saveEditWeek} className="rounded p-1 hover:bg-muted"><Check className="h-3.5 w-3.5 text-success" /></button>
                      <button onClick={() => setEditingWeekId(null)} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground shrink-0">{wp.dates}</span>
                      <span className="text-sm font-medium truncate">{wp.topic}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <div className="flex items-center gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={wp.weightage}
                      onChange={(e) => updateWeightage(wp.id, parseInt(e.target.value) || 0)}
                      className="h-7 w-14 text-xs text-center"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {!isEditing && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); startEditWeek(wp); }} className="rounded p-1.5 hover:bg-muted" title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteWeek(wp.id); }} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <CardContent className="pt-0 pb-4 space-y-2">
                  {wp.resources.map((r) => {
                    const Icon = typeIcons[r.type] || BookOpen;
                    const isEditingRes = editingResourceId === r.id;

                    return (
                      <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                        <div className="pt-0.5">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        {isEditingRes ? (
                          <div className="flex-1 space-y-2">
                            <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} placeholder="Resource title" className="h-7 text-xs" />
                            <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} placeholder="Action / description" className="h-7 text-xs" />
                            <div className="flex gap-1">
                              <button onClick={() => saveEditResource(wp.id)} className="rounded p-1 hover:bg-muted"><Check className="h-3.5 w-3.5 text-success" /></button>
                              <button onClick={() => setEditingResourceId(null)} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{r.title}</span>
                              <Badge variant="outline" className={`text-[10px] ${typeColors[r.type] || ""}`}>{typeLabels[r.type] || r.type}</Badge>
                              {r.source && <span className="text-[10px] text-muted-foreground">{r.source}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.action}</p>
                          </div>
                        )}
                        {!isEditingRes && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => startEditResource(r)} className="rounded p-1.5 hover:bg-muted" title="Edit">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button onClick={() => deleteResource(wp.id, r.id)} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add resource buttons */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(["textbook", "exercise", "case-study", "article"] as Resource["type"][]).map((type) => (
                      <Button key={type} variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={() => addResourceToWeek(wp.id, type)}>
                        <Plus className="mr-1 h-3 w-3" /> {typeLabels[type]}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TeachingPlan;
