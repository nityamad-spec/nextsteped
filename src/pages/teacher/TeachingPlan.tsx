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
  Presentation, FileSpreadsheet, Download, ExternalLink, Lock, Unlock,
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

const confirmedPlan: DayPlan[] = [
  { id: "d1", day: 1, dates: "Day 1", topic: "Python Fundamentals: Variables, Data Types & Control Flow", weightage: 30, locked: true, resources: [
    { id: "r1", title: "Intro to Python Slides", action: "Cover variables, data types, operators, and basic I/O", type: "textbook", provenance: "uploads" },
    { id: "r2", title: "Python Setup Guide", action: "Help students install Python and set up their IDE", type: "textbook", provenance: "uploads" },
    { id: "r4", title: "Interactive Coding Exercise", action: "Practice variables and data types in live coding session", type: "exercise", provenance: "uploads" },
  ]},
  { id: "d2", day: 2, dates: "Day 2", topic: "Functions, Lists & Dictionaries", weightage: 40, locked: false, resources: [
    { id: "r3", title: "Functions & Data Structures Slides", action: "Cover function definitions, parameters, return values, lists, and dictionaries", type: "textbook", provenance: "uploads" },
    { id: "r6", title: "Calculator Lab", action: "Build a calculator using functions", type: "lab", provenance: "uploads" },
    { id: "r11", title: "List Comprehension Exercise", action: "Hands-on practice with list comprehensions and dictionary operations", type: "lab", provenance: "uploads" },
  ]},
  { id: "d3", day: 3, dates: "Day 3", topic: "File Handling, OOP Basics & Review", weightage: 30, locked: false, resources: [
    { id: "r18", title: "OOP & File Handling Slides", action: "Cover classes, objects, file reading/writing", type: "textbook", provenance: "uploads" },
    { id: "r21", title: "File Organizer Project", action: "Build a simple file organizer script", type: "exercise", provenance: "uploads" },
    { id: "r16", title: "Workshop Review Sheet", action: "Comprehensive review covering all workshop topics", type: "textbook", provenance: "uploads" },
  ]},
];

const TeachingPlan = () => {
  const { toast } = useToast();
  const [days, setDays] = useState<DayPlan[]>(confirmedPlan);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ days: false, resources: false });
  const [removeConfirm, setRemoveConfirm] = useState<{ dayId: string; resourceId: string; title: string } | null>(null);

  const markChanged = () => { setHasChanges(true); setPublished(false); };
  const totalWeightage = days.reduce((sum, d) => sum + (d.weightage || 0), 0);

  const updateWeightage = (dayId: string, value: number) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, weightage: Math.max(0, value) } : d));
    markChanged();
  };

  const toggleLock = (dayId: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, locked: !d.locked } : d));
    markChanged();
    const day = days.find(d => d.id === dayId);
    toast({
      title: day?.locked ? "Day unlocked" : "Day locked",
      description: day?.locked
        ? `Day ${day.day} content is now available to the chatbot`
        : `Day ${day?.day} content is now restricted from the chatbot`,
    });
  };

  const toggleDay = (id: string) => {
    setExpandedDays((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  };

  const startEditDay = (dp: DayPlan) => {
    setEditingDayId(dp.id); setEditTopic(dp.topic); setEditDates(dp.dates);
    if (!expandedDays.includes(dp.id)) toggleDay(dp.id);
  };

  const saveEditDay = () => {
    if (!editingDayId) return;
    setDays((prev) => prev.map((d) => d.id === editingDayId ? { ...d, topic: editTopic, dates: editDates } : d));
    setEditingDayId(null); markChanged();
  };

  const confirmDeleteResource = (dayId: string, resourceId: string) => {
    const day = days.find((d) => d.id === dayId);
    const resource = day?.resources.find((r) => r.id === resourceId);
    if (resource) setRemoveConfirm({ dayId, resourceId, title: resource.title });
  };

  const executeRemove = () => {
    if (!removeConfirm) return;
    const { dayId, resourceId } = removeConfirm;
    const day = days.find((d) => d.id === dayId);
    const resource = day?.resources.find((r) => r.id === resourceId);
    if (resource) {
      const removedResource = { ...resource };
      setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: d.resources.filter((r) => r.id !== resourceId) } : d));
      markChanged();
      toast({
        title: "Resource removed",
        description: removedResource.title,
        action: (
          <Button variant="outline" size="sm" onClick={() => {
            setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, removedResource] } : d));
          }}>
            Undo
          </Button>
        ),
      });
    }
    setRemoveConfirm(null);
  };

  const deleteDay = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, day: i + 1 }))); markChanged();
  };

  const addDay = () => {
    const newDay: DayPlan = { id: `d_new_${Date.now()}`, day: days.length + 1, dates: `Day ${days.length + 1}`, topic: "New Topic", resources: [], weightage: 0, locked: false };
    setDays((prev) => [...prev, newDay]); markChanged();
    setExpandedDays((prev) => [...prev, newDay.id]);
    startEditDay(newDay);
  };

  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id); setEditResourceTitle(r.title); setEditResourceAction(r.action);
  };

  const saveEditResource = (dayId: string) => {
    if (!editingResourceId) return;
    setDays((prev) => prev.map((d) => d.id === dayId ? {
      ...d, resources: d.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction } : r),
    } : d));
    setEditingResourceId(null); markChanged();
  };

  const addResourceToDay = (dayId: string, type: Resource["type"]) => {
    const newResource: Resource = { id: makeId(), title: "", action: "", type, provenance: "instructor" };
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, newResource] } : d)); markChanged();
    setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction("");
  };

  const handlePublish = () => {
    setPublished(true); setPublishTimestamp(new Date().toLocaleString());
    setHasChanges(false); setShowPublishModal(false);
    setPublishChecklist({ days: false, resources: false });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "AI WORKSHOP LESSON PLAN - Intro to Python\n";
    content += `${days.length} Days\n\n`;
    days.forEach((d) => {
      content += `Day ${d.day} (${d.dates}): ${d.topic} [${d.weightage}%] ${d.locked ? "[LOCKED]" : "[UNLOCKED]"}\n`;
      d.resources.forEach((r) => { content += `  [${typeLabels[r.type]}] ${r.title}\n    → ${r.action}\n`; });
      content += "\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = format === "pdf" ? "workshop-plan.pdf" : "workshop-plan.doc"; a.click();
    URL.revokeObjectURL(url);
  };

  const allChecked = publishChecklist.days && publishChecklist.resources;
  const lockedDaysCount = days.filter(d => d.locked).length;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">AI Workshop Lesson Plan</h1>
          <p className="text-muted-foreground">Your confirmed workshop plan — edit topics, resources, and lock/unlock days</p>
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
          <Button size="sm" variant="outline" onClick={addDay}><Plus className="mr-1 h-4 w-4" /> Add Day</Button>
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

      {/* Lock status summary + auto-unlock callout */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 bg-muted/30">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">
          <span className="font-medium">{lockedDaysCount}</span> of {days.length} days locked — chatbot will only use content from locked days
        </span>
      </div>
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
        <span className="text-primary mt-0.5">💡</span>
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">Auto-unlock:</strong> Days are automatically unlocked as the workshop progresses. Day 1 is unlocked on the first day, Day 2 on the second, and so on. You can also manually lock/unlock any day at any time to override the automatic schedule.
        </span>
      </div>

      {/* Weightage Summary */}
      <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-warning/30 bg-warning/5"}`}>
        <span className="text-sm font-medium">Total Weightage:</span>
        <span className={`text-lg font-bold ${totalWeightage === 100 ? "text-primary" : "text-warning"}`}>{totalWeightage}%</span>
        <span className="text-xs text-muted-foreground">/ 100%</span>
        {totalWeightage !== 100 && <span className="text-xs text-warning ml-auto">Adjust day weightages to total 100%</span>}
        {totalWeightage === 100 && <Check className="h-4 w-4 text-primary ml-auto" />}
      </div>

      <Tabs defaultValue="plan" className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="plan">Day Plan</TabsTrigger>
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
                { name: "PY101_Syllabus.pdf", type: "Syllabus", size: "1.8 MB", date: "Aug 10, 2025", icon: FileText },
                { name: "Day1_Python_Fundamentals_Slides.pptx", type: "Slides", size: "5.2 MB", date: "Aug 10, 2025", icon: Presentation },
                { name: "Day2_Functions_DataStructures_Slides.pptx", type: "Slides", size: "4.7 MB", date: "Aug 10, 2025", icon: Presentation },
                { name: "Day3_OOP_FileHandling_Slides.pptx", type: "Slides", size: "3.9 MB", date: "Aug 10, 2025", icon: Presentation },
                { name: "Practice_Problems_Set1.pdf", type: "Problem Set", size: "540 KB", date: "Aug 10, 2025", icon: FileSpreadsheet },
                { name: "Python_Reference_Guide.pdf", type: "Reading", size: "8.3 MB", date: "Aug 10, 2025", icon: BookOpen },
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
        {days.map((dp) => {
          const isExpanded = expandedDays.includes(dp.id);
          const isEditing = editingDayId === dp.id;

          return (
            <Card key={dp.id} className={dp.locked ? "border-primary/30" : ""}>
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleDay(dp.id)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant="outline" className="shrink-0 text-xs">Day {dp.day}</Badge>
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-7 w-28 text-xs" />
                      <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-7 flex-1 text-xs" />
                      <button onClick={saveEditDay} className="rounded p-1 hover:bg-muted"><Check className="h-3.5 w-3.5 text-primary" /></button>
                      <button onClick={() => setEditingDayId(null)} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">{dp.topic}</span>
                      <span className="text-xs text-muted-foreground">{dp.dates} · Generated from your course materials</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {/* Lock/Unlock button */}
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
                  <div className="flex items-center gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
                    <Input type="number" min={0} max={100} value={dp.weightage} onChange={(e) => updateWeightage(dp.id, parseInt(e.target.value) || 0)} className="h-7 w-14 text-xs text-center" aria-label={`Weightage for day ${dp.day}`} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {!isEditing && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); startEditDay(dp); }} aria-label="Edit day">
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteDay(dp.id); }} aria-label="Remove day">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                      </Button>
                    </>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <CardContent className="pt-0 pb-4 space-y-2">
                  {dp.resources.map((r) => {
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
                              <button onClick={() => saveEditResource(dp.id)} className="rounded p-1 hover:bg-muted"><Check className="h-3.5 w-3.5 text-primary" /></button>
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
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => confirmDeleteResource(dp.id, r.id)} aria-label="Remove resource">
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
                      <Button key={type} variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={() => addResourceToDay(dp.id, type)}>
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

export default TeachingPlan;
