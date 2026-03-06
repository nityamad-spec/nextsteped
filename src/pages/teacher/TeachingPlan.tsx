import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronDown, ChevronUp, Pencil, Trash2, Plus, Upload, FileText,
  Check, X, BookOpen, FlaskConical, Newspaper, LibraryBig, FileDown,
  Presentation, FileSpreadsheet, Download, ExternalLink,
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

const typeIcons: Record<string, typeof BookOpen> = {
  textbook: BookOpen, exercise: FlaskConical, lab: FlaskConical, tool: FlaskConical,
  "case-study": LibraryBig, article: Newspaper, news: Newspaper, video: BookOpen,
};

const provenanceLabels: Record<string, { label: string; className: string }> = {
  uploads: { label: "From uploads", className: "bg-primary/10 text-primary border-primary/20" },
  web: { label: "From web", className: "bg-accent/10 text-accent-foreground border-accent/20" },
  instructor: { label: "Instructor added", className: "bg-secondary text-secondary-foreground border-secondary" },
};

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const confirmedPlan: WeekPlan[] = [
  { id: "d1", week: 1, dates: "Day 1", topic: "Introduction to OS Concepts & Process Lifecycle", weightage: 30, resources: [
    { id: "r1", title: "Textbook Ch. 1-2", action: "Assign chapters 1-2 as required reading before class", type: "textbook", provenance: "uploads" },
    { id: "r2", title: "AICTE Module 1 Guide", action: "Reference AICTE guidelines to align lecture with curriculum standards", type: "textbook", provenance: "uploads" },
    { id: "r4", title: "Scheduling Simulator", action: "Use in a 20-min live demo to visualize FCFS vs Round Robin", type: "exercise", provenance: "uploads" },
  ]},
  { id: "d2", week: 2, dates: "Day 2", topic: "Process Scheduling & Synchronization Fundamentals", weightage: 40, resources: [
    { id: "r3", title: "Textbook Ch. 3-4", action: "Assign chapters 3-4 on scheduling and threads", type: "textbook", provenance: "uploads" },
    { id: "r6", title: "Scheduling Algorithms Lab", action: "Include a 30-min in-class lab where students implement and compare scheduling algorithms", type: "lab", provenance: "uploads" },
    { id: "r11", title: "Producer-Consumer Lab", action: "Run a 30-min hands-on lab implementing the producer-consumer problem", type: "lab", provenance: "uploads" },
  ]},
  { id: "d3", week: 3, dates: "Day 3", topic: "Memory Management & Review", weightage: 30, resources: [
    { id: "r18", title: "Textbook Ch. 7-8", action: "Assign chapters 7-8 on memory hierarchy and paging", type: "textbook", provenance: "uploads" },
    { id: "r21", title: "Page Table Simulator", action: "Use in a 20-min demo to show address translation step by step", type: "exercise", provenance: "uploads" },
    { id: "r16", title: "Review Sheet", action: "Distribute comprehensive review covering all workshop topics", type: "textbook", provenance: "uploads" },
  ]},
];

const TeachingPlan = () => {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState<WeekPlan[]>(confirmedPlan);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ weeks: false, resources: false });
  const [removeConfirm, setRemoveConfirm] = useState<{ weekId: string; resourceId: string; title: string } | null>(null);

  const markChanged = () => { setHasChanges(true); setPublished(false); };
  const totalWeightage = weeks.reduce((sum, w) => sum + (w.weightage || 0), 0);

  const updateWeightage = (weekId: string, value: number) => {
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, weightage: Math.max(0, value) } : w));
    markChanged();
  };

  const toggleWeek = (id: string) => {
    setExpandedWeeks((prev) => prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]);
  };

  const startEditWeek = (wp: WeekPlan) => {
    setEditingWeekId(wp.id); setEditTopic(wp.topic); setEditDates(wp.dates);
    if (!expandedWeeks.includes(wp.id)) toggleWeek(wp.id);
  };

  const saveEditWeek = () => {
    if (!editingWeekId) return;
    setWeeks((prev) => prev.map((w) => w.id === editingWeekId ? { ...w, topic: editTopic, dates: editDates } : w));
    setEditingWeekId(null); markChanged();
  };

  const confirmDeleteResource = (weekId: string, resourceId: string) => {
    const week = weeks.find((w) => w.id === weekId);
    const resource = week?.resources.find((r) => r.id === resourceId);
    if (resource) setRemoveConfirm({ weekId, resourceId, title: resource.title });
  };

  const executeRemove = () => {
    if (!removeConfirm) return;
    const { weekId, resourceId } = removeConfirm;
    const week = weeks.find((w) => w.id === weekId);
    const resource = week?.resources.find((r) => r.id === resourceId);
    if (resource) {
      const removedResource = { ...resource };
      setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: w.resources.filter((r) => r.id !== resourceId) } : w));
      markChanged();
      toast({
        title: "Resource removed",
        description: removedResource.title,
        action: (
          <Button variant="outline" size="sm" onClick={() => {
            setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: [...w.resources, removedResource] } : w));
          }}>
            Undo
          </Button>
        ),
      });
    }
    setRemoveConfirm(null);
  };

  const deleteWeek = (id: string) => {
    setWeeks((prev) => prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, week: i + 1 }))); markChanged();
  };

  const addWeek = () => {
    const newWeek: WeekPlan = { id: `w_new_${Date.now()}`, week: weeks.length + 1, dates: "TBD", topic: "New Topic", resources: [], weightage: 0 };
    setWeeks((prev) => [...prev, newWeek]); markChanged();
    setExpandedWeeks((prev) => [...prev, newWeek.id]);
    startEditWeek(newWeek);
  };

  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id); setEditResourceTitle(r.title); setEditResourceAction(r.action);
  };

  const saveEditResource = (weekId: string) => {
    if (!editingResourceId) return;
    setWeeks((prev) => prev.map((w) => w.id === weekId ? {
      ...w, resources: w.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction } : r),
    } : w));
    setEditingResourceId(null); markChanged();
  };

  const addResourceToWeek = (weekId: string, type: Resource["type"]) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type, provenance: "instructor" };
    setWeeks((prev) => prev.map((w) => w.id === weekId ? { ...w, resources: [...w.resources, newResource] } : w)); markChanged();
    setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction("");
  };

  const handlePublish = () => {
    setPublished(true); setPublishTimestamp(new Date().toLocaleString());
    setHasChanges(false); setShowPublishModal(false);
    setPublishChecklist({ weeks: false, resources: false });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "TEACHING PLAN - Operating Systems\n";
    content += `${weeks.length} Weeks\n\n`;
    weeks.forEach((w) => {
      content += `Week ${w.week} (${w.dates}): ${w.topic} [${w.weightage}%]\n`;
      w.resources.forEach((r) => { content += `  [${typeLabels[r.type]}] ${r.title}\n    → ${r.action}\n`; });
      content += "\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = format === "pdf" ? "teaching-plan.pdf" : "teaching-plan.doc"; a.click();
    URL.revokeObjectURL(url);
  };

  const allChecked = publishChecklist.weeks && publishChecklist.resources;

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
              <Button variant="outline" size="sm"><FileDown className="mr-1 h-4 w-4" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>Export as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("word")}>Export as Word</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!published ? (
            <Button size="sm" onClick={() => setShowPublishModal(true)}>
              Publish plan & activate Student TA
            </Button>
          ) : (
            <Badge className="bg-primary text-primary-foreground px-3 py-1">Published · {publishTimestamp}</Badge>
          )}
          <Button size="sm" variant="outline" onClick={addWeek}><Plus className="mr-1 h-4 w-4" /> Add Week</Button>
        </div>
      </div>

      {/* Published status */}
      {published && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Plan published</span>
            <span className="text-xs text-muted-foreground">{publishTimestamp}</span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            <ExternalLink className="h-3 w-3" /> Preview student view
          </Button>
        </div>
      )}

      {/* Weightage Summary */}
      <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-warning/30 bg-warning/5"}`}>
        <span className="text-sm font-medium">Total Weightage:</span>
        <span className={`text-lg font-bold ${totalWeightage === 100 ? "text-primary" : "text-warning"}`}>{totalWeightage}%</span>
        <span className="text-xs text-muted-foreground">/ 100%</span>
        {totalWeightage !== 100 && <span className="text-xs text-warning ml-auto">Adjust week weightages to total 100%</span>}
        {totalWeightage === 100 && <Check className="h-4 w-4 text-primary ml-auto" />}
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
                <Button variant="outline" size="sm"><Upload className="mr-2 h-4 w-4" /> Upload New</Button>
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><file.icon className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.type} • {file.size} • Uploaded {file.date}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8"><Download className="h-3.5 w-3.5" /></Button>
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
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleWeek(wp.id)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant="outline" className="shrink-0 text-xs">Week {wp.week}</Badge>
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-7 w-28 text-xs" />
                      <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-7 flex-1 text-xs" />
                      <button onClick={saveEditWeek} className="rounded p-1 hover:bg-muted"><Check className="h-3.5 w-3.5 text-primary" /></button>
                      <button onClick={() => setEditingWeekId(null)} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">{wp.topic}</span>
                      <span className="text-xs text-muted-foreground">{wp.dates} · Generated from your course materials</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <div className="flex items-center gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
                    <Input type="number" min={0} max={100} value={wp.weightage} onChange={(e) => updateWeightage(wp.id, parseInt(e.target.value) || 0)} className="h-7 w-14 text-xs text-center" aria-label={`Weightage for week ${wp.week}`} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {!isEditing && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); startEditWeek(wp); }} aria-label="Edit week">
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteWeek(wp.id); }} aria-label="Remove week">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                      </Button>
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
                    const prov = r.provenance ? provenanceLabels[r.provenance] : null;

                    return (
                      <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                        <div className="pt-0.5"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                        {isEditingRes ? (
                          <div className="flex-1 space-y-2">
                            <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} placeholder="Resource title" className="h-7 text-xs" />
                            <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} placeholder="Action / description" className="h-7 text-xs" />
                            <div className="flex gap-1">
                              <button onClick={() => saveEditResource(wp.id)} className="rounded p-1 hover:bg-muted"><Check className="h-3.5 w-3.5 text-primary" /></button>
                              <button onClick={() => setEditingResourceId(null)} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{r.title}</span>
                              <Badge variant="outline" className={`text-[10px] ${typeColors[r.type] || ""}`}>{typeLabels[r.type] || r.type}</Badge>
                              {prov && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${prov.className}`}>{prov.label}</Badge>}
                              {r.source && (
                                <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                  <ExternalLink className="h-2.5 w-2.5" /> {r.source}
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.action}</p>
                          </div>
                        )}
                        {!isEditingRes && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => startEditResource(r)} aria-label="Edit resource">
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => confirmDeleteResource(wp.id, r.id)} aria-label="Remove resource">
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                            </Button>
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

export default TeachingPlan;
