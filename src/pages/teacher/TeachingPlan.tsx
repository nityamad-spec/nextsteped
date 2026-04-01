import { useState, useEffect } from "react";
import { motion, Reorder } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  ChevronDown, ChevronUp, Pencil, Trash2, Plus, FileText, FileDown,
  Check, BookOpen, Download, Lock, Unlock, Sparkles, Loader2, GripVertical,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { workshopPlan as defaultPlan } from "@/data/workshopPlan";

type Resource = {
  id: string;
  title: string;
  action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video" | "quiz";
  source?: string;
  accepted?: boolean | null;
  provenance?: "uploads" | "web" | "instructor";
};

type DayPlan = {
  id: string;
  day: number;
  dates: string;
  topic: string;
  description?: string;
  resources: Resource[];
  weightage: number;
  locked: boolean;
};

const typeLabels: Record<string, string> = {
  textbook: "Textbook / Reading", exercise: "Interactive Exercise", lab: "Lab / Hands-on",
  tool: "Tool / Software", "case-study": "Case Study", article: "Article / Industry",
  news: "News / Current Events", video: "Video", quiz: "Daily Quiz",
};

const typeIcons: Record<string, string> = {
  textbook: "📖", exercise: "🏋️", lab: "🧪", tool: "🔧",
  "case-study": "📋", article: "📰", news: "📰", video: "🎬", quiz: "📝",
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
  quiz: "bg-primary/10 text-primary border-primary/20",
};

const provenanceLabels: Record<string, { label: string; className: string }> = {
  uploads: { label: "From uploads", className: "bg-primary/10 text-primary border-primary/20" },
  web: { label: "From web", className: "bg-accent/10 text-accent-foreground border-accent/20" },
  instructor: { label: "Instructor added", className: "bg-secondary text-secondary-foreground border-secondary" },
};

const resourceTypeOptions: { value: Resource["type"]; label: string }[] = [
  { value: "textbook", label: "Textbook / Reading" },
  { value: "exercise", label: "Interactive Exercise" },
  { value: "lab", label: "Lab / Hands-on" },
  { value: "case-study", label: "Case Study" },
  { value: "article", label: "Article / Industry Context" },
  { value: "video", label: "Video" },
  { value: "tool", label: "Tool / Software" },
  { value: "quiz", label: "Daily Quiz" },
];

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const TeachingPlan = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const courseId = localStorage.getItem("currentCourseId");

  const [days, setDays] = useState<DayPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editDates, setEditDates] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceAction, setEditResourceAction] = useState("");
  const [editResourceType, setEditResourceType] = useState<Resource["type"]>("textbook");
  const [hasChanges, setHasChanges] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChecklist, setPublishChecklist] = useState({ days: false, resources: false });
  const [removeConfirm, setRemoveConfirm] = useState<{ dayId: string; resourceId: string; title: string } | null>(null);
  const [suggestingDayId, setSuggestingDayId] = useState<string | null>(null);
  const [addingResourceDayId, setAddingResourceDayId] = useState<string | null>(null);
  const [newResourceType, setNewResourceType] = useState<Resource["type"]>("exercise");
  const [saving, setSaving] = useState(false);

  const markChanged = () => setHasChanges(true);

  // Load plan from storage
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const { data } = await supabase.storage
          .from("course-materials")
          .download(`${user.id}/lesson-plan/published-plan.json`);
        if (data) {
          const parsed = JSON.parse(await data.text());
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDays(parsed);
            setLoading(false);
            return;
          }
        }
      } catch { /* no saved plan */ }
      // Fallback to default
      setDays(defaultPlan.map(d => ({ ...d, description: "" })));
      setLoading(false);
    };
    load();
  }, [user]);

  const totalWeightage = days.reduce((sum, d) => sum + (d.weightage || 0), 0);
  const lockedDaysCount = days.filter(d => d.locked).length;

  // Save to storage
  const savePlan = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const blob = new Blob([JSON.stringify(days, null, 2)], { type: "application/json" });
      const file = new File([blob], "published-plan.json", { type: "application/json" });
      const { error } = await supabase.storage
        .from("course-materials")
        .upload(`${user.id}/lesson-plan/published-plan.json`, file, { upsert: true });
      if (error) throw error;
      setHasChanges(false);
      toast({ title: "Plan saved", description: "Your lesson plan has been saved successfully." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
    setEditingDayId(null); markChanged();
  };

  const updateWeightage = (dayId: string, value: number) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, weightage: Math.max(0, value) } : d));
    markChanged();
  };

  const updateDescription = (dayId: string, description: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, description } : d));
    markChanged();
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
    markChanged();
  };

  const deleteDay = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, day: i + 1 }))); markChanged();
  };

  const addDay = () => {
    const newDay: DayPlan = {
      id: `d_new_${Date.now()}`, day: days.length + 1, dates: `Day ${days.length + 1}`,
      topic: "New Topic", description: "", resources: [], weightage: 0, locked: true,
    };
    setDays((prev) => [...prev, newDay]);
    setExpandedDays((prev) => [...prev, newDay.id]);
    startEditDay(newDay); markChanged();
  };

  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id); setEditResourceTitle(r.title); setEditResourceAction(r.action); setEditResourceType(r.type);
  };

  const saveEditResource = (dayId: string) => {
    if (!editingResourceId) return;
    setDays((prev) => prev.map((d) => d.id === dayId ? {
      ...d, resources: d.resources.map((r) => r.id === editingResourceId ? { ...r, title: editResourceTitle, action: editResourceAction, type: editResourceType } : r),
    } : d));
    setEditingResourceId(null); markChanged();
  };

  const handleAddResource = (dayId: string) => {
    const day = days.find(d => d.id === dayId);
    const dayNumber = day?.day || 1;
    const isQuiz = newResourceType === "quiz";
    const newResource: Resource = {
      id: makeId(),
      title: isQuiz ? `Daily Quiz — Day ${dayNumber}` : "",
      action: isQuiz ? "Test your understanding of today's concepts" : "",
      type: newResourceType,
      accepted: true,
      provenance: "instructor",
    };
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, newResource] } : d));
    if (!isQuiz) {
      setEditingResourceId(newResource.id); setEditResourceTitle(""); setEditResourceAction(""); setEditResourceType(newResourceType);
    }
    setAddingResourceDayId(null); markChanged();
  };

  const removeResource = (dayId: string, resourceId: string) => {
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
      const removed = { ...resource };
      setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: d.resources.filter((r) => r.id !== resourceId) } : d));
      markChanged();
      toast({
        title: "Resource removed", description: removed.title,
        action: <Button variant="outline" size="sm" onClick={() => {
          setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, removed] } : d));
        }}>Undo</Button>,
      });
    }
    setRemoveConfirm(null);
  };

  const handleAiSuggest = async (dayId: string) => {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    setSuggestingDayId(dayId);
    try {
      let objectives: string[] = [];
      if (courseId) {
        const { data: course } = await supabase
          .from("courses").select("objectives").eq("id", courseId).single();
        if (course?.objectives) objectives = course.objectives;
      }
      const { data, error } = await supabase.functions.invoke("suggest-lesson", {
        body: {
          dayNumber: day.day, dayTopic: day.topic,
          existingDescription: day.description || "",
          courseObjectives: objectives, totalDays: days.length,
          existingResources: day.resources.map(r => ({ title: r.title, action: r.action })),
        },
      });
      if (error) throw error;
      if (data?.error) { toast({ title: "AI suggestion failed", description: data.error, variant: "destructive" }); return; }
      if (data?.suggestion) updateDescription(dayId, data.suggestion);
      if (data?.suggestedResources?.length > 0) {
        const newResources: Resource[] = data.suggestedResources.map((r: any) => ({
          id: makeId(), title: r.title || "Untitled Resource", action: r.action || "",
          type: r.type || "exercise", accepted: true, provenance: r.provenance || "instructor",
        }));
        setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, ...newResources] } : d));
        toast({ title: "AI suggestion applied", description: `Updated description and added ${newResources.length} resource(s) to Day ${day.day}.` });
      } else {
        toast({ title: "Suggestion generated", description: `AI suggestion applied to Day ${day.day}.` });
      }
    } catch (err: any) {
      toast({ title: "Failed to generate suggestion", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setSuggestingDayId(null);
    }
  };

  const handlePublish = async () => {
    await savePlan();
    setShowPublishModal(false);
    setPublishChecklist({ days: false, resources: false });
    toast({ title: "Plan published", description: "Students can now see the updated lesson plan." });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "AI WORKSHOP LESSON PLAN\n";
    content += `${days.length} Days\n\n`;
    days.forEach((d) => {
      content += `Day ${d.day} (${d.dates}): ${d.topic} [${d.weightage}%] ${d.locked ? "[LOCKED]" : "[UNLOCKED]"}\n`;
      if (d.description) content += `\nDescription:\n${d.description}\n`;
      content += "\nResources:\n";
      d.resources.forEach((r) => { content += `  - [${typeLabels[r.type]}] ${r.title}\n    ${r.action}\n`; });
      content += "\n---\n\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = format === "pdf" ? "workshop-plan.pdf" : "workshop-plan.doc"; a.click();
    URL.revokeObjectURL(url);
  };

  const renderDescription = (desc: string) => {
    if (!desc) return null;
    const sections = desc.split(/\n(?=\*\*[^*]+:\*\*)/);
    return (
      <div className="space-y-3">
        {sections.map((section, i) => {
          const headingMatch = section.match(/^\*\*([^*]+):\*\*/);
          if (headingMatch) {
            const heading = headingMatch[1];
            const body = section.replace(/^\*\*[^*]+:\*\*\s*/, "").trim();
            const lines = body.split("\n").filter(l => l.trim());
            const isList = lines.every(l => l.trim().startsWith("-") || l.trim().startsWith("•"));
            return (
              <div key={i} className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">{heading}</h4>
                {isList ? (
                  <ul className="space-y-0.5 pl-1">
                    {lines.map((line, j) => (
                      <li key={j} className="text-sm text-foreground/80 flex items-start gap-2">
                        <span className="text-primary mt-1.5 shrink-0 h-1 w-1 rounded-full bg-primary inline-block" />
                        <span>{line.replace(/^[-•]\s*/, "")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-foreground/80 leading-relaxed">{body}</p>
                )}
              </div>
            );
          }
          return <p key={i} className="text-sm text-foreground/80 leading-relaxed">{section.replace(/\*\*/g, "")}</p>;
        })}
      </div>
    );
  };

  const allChecked = publishChecklist.days && publishChecklist.resources;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">AI Workshop Lesson Plan</h1>
          <p className="text-muted-foreground text-sm">Edit topics, descriptions, resources, and lock/unlock days for students</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("pdf")}><FileText className="mr-2 h-4 w-4" /> Export as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("word")}><FileDown className="mr-2 h-4 w-4" /> Export as Word</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hasChanges && (
            <Button size="sm" onClick={savePlan} disabled={saving}>
              {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save Changes"}
            </Button>
          )}
          <Button size="sm" variant="default" onClick={() => setShowPublishModal(true)}>
            Publish to Students
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${totalWeightage === 100 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${totalWeightage === 100 ? "bg-primary/10" : "bg-destructive/10"}`}>
            <span className={`text-sm font-bold ${totalWeightage === 100 ? "text-primary" : "text-destructive"}`}>{totalWeightage}%</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Weightage</p>
            <p className={`text-sm font-semibold ${totalWeightage === 100 ? "text-primary" : "text-destructive"}`}>
              {totalWeightage === 100 ? "Balanced" : `${100 - totalWeightage}% remaining`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 bg-muted/20">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
            <span className="text-sm font-bold text-foreground">{days.length}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Days</p>
            <p className="text-sm font-semibold text-foreground">{days.reduce((s, d) => s + d.resources.length, 0)} resources</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 bg-muted/20">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Locked Days</p>
            <p className="text-sm font-semibold text-foreground">{lockedDaysCount} of {days.length} locked</p>
          </div>
        </div>
      </div>

      {/* Auto-unlock callout */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
        <span className="text-primary mt-0.5">💡</span>
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">Auto-unlock:</strong> Days are automatically unlocked as the workshop progresses. You can also manually lock/unlock any day at any time.
        </span>
      </div>

      <Tabs defaultValue="plan" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="plan">Day Plan</TabsTrigger>
            <TabsTrigger value="materials">Uploaded Materials</TabsTrigger>
          </TabsList>
          <h2 className="text-sm font-medium text-muted-foreground">{days.length} day{days.length !== 1 ? "s" : ""}</h2>
        </div>

        <TabsContent value="materials" className="space-y-4">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Materials uploaded during setup are available here. To upload new materials, use the file upload in course setup.</p>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          <Reorder.Group axis="y" values={days} onReorder={(newOrder) => { setDays(newOrder.map((d, i) => ({ ...d, day: i + 1 }))); markChanged(); }}>
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
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${dp.locked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                              <span className="text-xs font-bold">{dp.day}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{dp.topic}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">{dp.dates}</span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{dp.weightage}% weightage</span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{dp.resources.length} resources</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost" size="sm"
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
                          <div className="px-5 py-5 space-y-5">
                            {/* Editable header fields */}
                            {isEditing ? (
                              <div className="space-y-3 p-4 rounded-lg bg-muted/20 border border-dashed">
                                <div className="space-y-1.5">
                                  <Label className="text-xs font-medium">Topic</Label>
                                  <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="h-9 text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Date / Label</Label>
                                    <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-9 text-sm" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Weightage (%)</Label>
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
                                <Button size="sm" variant="outline" onClick={() => startEditDay(dp)} className="h-8 text-xs">
                                  <Pencil className="h-3 w-3 mr-1.5" /> Edit Day Info
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteDay(dp.id)} className="h-8 text-xs text-destructive hover:text-destructive">
                                  <Trash2 className="h-3 w-3 mr-1.5" /> Remove Day
                                </Button>
                              </div>
                            )}

                            {/* Lesson Description */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-5 w-1 rounded-full bg-primary" />
                                  <Label className="text-sm font-semibold">Lesson Description</Label>
                                </div>
                                <Button
                                  variant="outline" size="sm"
                                  onClick={() => handleAiSuggest(dp.id)}
                                  disabled={isSuggesting}
                                  className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50"
                                >
                                  {isSuggesting ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                                  ) : (
                                    <><Sparkles className="h-3.5 w-3.5" /> AI Suggest</>
                                  )}
                                </Button>
                              </div>

                              {isSuggesting ? (
                                <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 flex flex-col items-center gap-3">
                                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                  <p className="text-sm text-primary font-medium">AI is generating lesson description & resources…</p>
                                  <p className="text-xs text-muted-foreground">This may take 10–20 seconds</p>
                                </div>
                              ) : dp.description ? (
                                <div className="rounded-lg border bg-muted/10 p-4">
                                  {renderDescription(dp.description)}
                                  <div className="mt-3 pt-3 border-t">
                                    <details className="group">
                                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                                        <Pencil className="h-3 w-3" /> Edit raw text
                                      </summary>
                                      <Textarea
                                        value={dp.description}
                                        onChange={(e) => updateDescription(dp.id, e.target.value)}
                                        className="mt-2 min-h-[160px] text-sm leading-relaxed resize-y font-mono text-xs"
                                      />
                                    </details>
                                  </div>
                                </div>
                              ) : (
                                <Textarea
                                  value={dp.description || ""}
                                  onChange={(e) => updateDescription(dp.id, e.target.value)}
                                  placeholder="Describe what this day covers — or click AI Suggest to auto-generate."
                                  className="min-h-[120px] text-sm leading-relaxed resize-y"
                                />
                              )}
                            </div>

                            {/* Resources */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-1 rounded-full bg-secondary" />
                                <Label className="text-sm font-semibold">Resources & Materials</Label>
                                <Badge variant="outline" className="text-[10px] ml-auto">{dp.resources.length} items</Badge>
                              </div>

                              {dp.resources.length === 0 && (
                                <div className="rounded-lg border border-dashed p-6 text-center">
                                  <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                                  <p className="text-sm text-muted-foreground">No resources added yet</p>
                                  <p className="text-xs text-muted-foreground mt-1">Add resources manually or use AI Suggest</p>
                                </div>
                              )}

                              <div className="space-y-2">
                                {dp.resources.map((r) => {
                                  const isEditingThis = editingResourceId === r.id;
                                  const prov = r.provenance ? provenanceLabels[r.provenance] : null;
                                  return (
                                    <div key={r.id} className={`rounded-lg px-4 py-3 border transition-colors ${typeColors[r.type] || "bg-muted/30 border-border"}`}>
                                      {isEditingThis ? (
                                        <div className="space-y-3">
                                          <div className="space-y-1.5">
                                            <Label className="text-[11px] font-medium">Type</Label>
                                            <Select value={editResourceType} onValueChange={(v) => setEditResourceType(v as Resource["type"])}>
                                              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                {resourceTypeOptions.map(opt => (
                                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <div className="space-y-1.5">
                                            <Label className="text-[11px] font-medium">Title</Label>
                                            <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-8 text-xs bg-background" />
                                          </div>
                                          <div className="space-y-1.5">
                                            <Label className="text-[11px] font-medium">Description</Label>
                                            <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} className="h-8 text-xs bg-background" />
                                          </div>
                                          <div className="flex gap-2">
                                            <Button size="sm" onClick={() => saveEditResource(dp.id)} className="h-7 text-xs px-3">Save</Button>
                                            <Button size="sm" variant="ghost" onClick={() => setEditingResourceId(null)} className="h-7 text-xs px-3">Cancel</Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex items-start gap-3 min-w-0">
                                            <span className="text-lg shrink-0 mt-0.5">{typeIcons[r.type] || "📄"}</span>
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium">{r.title || "Untitled"}</span>
                                                {prov && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${prov.className}`}>{prov.label}</Badge>}
                                              </div>
                                              <p className="text-xs mt-0.5 opacity-80">{r.action}</p>
                                            </div>
                                          </div>
                                          <div className="flex gap-1 shrink-0">
                                            <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-7 px-2 text-xs hover:bg-background/50">
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => removeResource(dp.id, r.id)} className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-background/50">
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Add resource */}
                              {addingResourceDayId === dp.id ? (
                                <div className="rounded-lg border border-dashed p-3 bg-muted/10 space-y-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Resource Type</Label>
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
                                  className="h-8 text-xs border-dashed w-full"
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Resource
                                </Button>
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
        </TabsContent>
      </Tabs>

      {/* Publish Modal */}
      <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Lesson Plan?</DialogTitle>
            <DialogDescription>Students will see the updated content. You can always come back to edit.</DialogDescription>
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

      {/* Remove Confirmation */}
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

export default TeachingPlan;
