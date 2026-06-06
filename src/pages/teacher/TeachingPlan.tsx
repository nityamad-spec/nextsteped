import { useState, useEffect } from "react";
import { motion, Reorder } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { supabase } from "@/integrations/supabase/client";
import {
  resolvePublishedPath,
  recordPublishedPath,
  canonicalPublishedPath,
  LESSON_PLAN_BUCKET,
} from "@/lib/lessonPlanPath";
import { normalizeLessonPlan } from "@/lib/lessonPlanShape";
import { upsertPublishedWeeks, setWeekLocked } from "@/lib/lessonPlanWeeks";
import { markStepCompleted } from "@/lib/setupProgress";
import { subscribeWipe } from "@/lib/wipeEvents";
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
  ChevronDown, ChevronUp, Pencil, Trash2, Plus, FileText, FileDown, X,
  Check, BookOpen, Download, Eye, EyeOff, Sparkles, Loader2, GripVertical, ArrowLeftRight, Clock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
// `workshopPlan` was removed as the empty-state fallback — we now render an
// explicit empty state when no plan exists rather than seeding bogus content.

type Resource = {
  id: string;
  title: string;
  action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video" | "quiz" | "exam";
  source?: string;
  accepted?: boolean | null;
  provenance?: "uploads" | "web" | "instructor";
  isNew?: boolean;
  concept?: string;
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

const typeIcons: Record<string, string> = {
  textbook: "📖", exercise: "🏋️", lab: "🧪", tool: "🔧",
  "case-study": "📋", article: "📰", news: "📰", video: "🎬", quiz: "📝", exam: "🎓",
};

const resourceTypeOptions: { value: Resource["type"]; label: string }[] = [
  { value: "textbook", label: "Textbook / Reading" },
  { value: "exercise", label: "Interactive Exercise" },
  { value: "lab", label: "Lab / Hands-on" },
  { value: "case-study", label: "Case Study" },
  { value: "article", label: "Article / Industry Context" },
  { value: "video", label: "Video" },
  { value: "tool", label: "Tool / Software" },
  { value: "quiz", label: "Weekly Quiz" },
  { value: "exam", label: "Exam" },
];

const makeId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

interface TeachingPlanProps {
  embedded?: boolean;
}

const TeachingPlan = ({ embedded = false }: TeachingPlanProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();

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
  const [editingConceptName, setEditingConceptName] = useState<string | null>(null);
  const [editConceptValue, setEditConceptValue] = useState("");
  const [courseCurrentWeek, setCourseCurrentWeek] = useState<number>(0);
  const [generatingQuizDay, setGeneratingQuizDay] = useState<number | null>(null);
  const [quizCounts, setQuizCounts] = useState<Record<number, number>>({});

  const renameConcept = (dayId: string, oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setEditingConceptName(null); return; }
    setDays(prev => prev.map(d => d.id === dayId ? {
      ...d,
      resources: d.resources.map(r => r.concept === oldName ? { ...r, concept: newName.trim() } : r),
      description: d.description?.replace(new RegExp(`Concept:\\s*${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `Concept: ${newName.trim()}`),
    } : d));
    setEditingConceptName(null); markChanged();
  };

  const moveResourceToConcept = (dayId: string, resourceId: string, newConcept: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? {
      ...d, resources: d.resources.map(r => r.id === resourceId ? { ...r, concept: newConcept } : r),
    } : d));
    markChanged();
  };

  const toggleResourceCategory = (dayId: string, resourceId: string) => {
    const inClassSet = new Set(["exercise", "lab", "tool", "video", "quiz", "exam"]);
    setDays(prev => prev.map(d => d.id === dayId ? {
      ...d, resources: d.resources.map(r => {
        if (r.id !== resourceId) return r;
        return { ...r, type: inClassSet.has(r.type) ? "textbook" as const : "exercise" as const };
      }),
    } : d));
    markChanged();
  };
  const [saving, setSaving] = useState(false);

  const markChanged = () => setHasChanges(true);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        if (!courseId) {
          setDays([]);
          setLoading(false);
          return;
        }
        const { data: courseRow } = await supabase
          .from("courses")
          .select("lesson_plan_path")
          .eq("id", courseId)
          .maybeSingle();
        const publishedPath = resolvePublishedPath(courseRow, courseId);
        // Cache-bust storage so a wipe is immediately visible.
        const { data } = await supabase.storage
          .from(LESSON_PLAN_BUCKET)
          .download(`${publishedPath}?t=${Date.now()}`);
        if (data) {
          const parsed = JSON.parse(await data.text());
          // Accept either the legacy array shape or the AI generator's
          // { weeks: [...] } object shape — normalize before hydrating state.
          const normalized = normalizeLessonPlan(parsed);
          if (normalized.length > 0) {
            const hydrated: DayPlan[] = normalized.map((w) => ({
              id: w.id,
              day: w.day,
              dates: `Week ${w.day}`,
              topic: w.topic,
              description: w.description,
              weightage: 0,
              locked: w.locked,
              resources: w.resources.map((r) => ({
                id: r.id,
                title: r.title,
                action: r.action || r.description || "",
                type: (r.type as Resource["type"]) || "article",
                concept: r.concept,
              })),
            }));
            setDays(hydrated);
            setLoading(false);
            return;
          }
        }
      } catch { /* no saved plan */ }
      setDays([]);
      setHasChanges(false);
      setLoading(false);
    };
    load();
  }, [user, courseId, reloadKey]);

  // Re-fetch plan when the syllabus cascade wipe fires for this course.
  useEffect(() => {
    if (!courseId) return;
    return subscribeWipe((detail) => {
      if (detail.courseId !== courseId) return;
      setReloadKey((k) => k + 1);
    });
  }, [courseId]);

  // Fetch course start_date to compute auto-reveal week
  useEffect(() => {
    if (!courseId) return;
    const fetchCourseWeek = async () => {
      const { data } = await supabase.from("courses").select("start_date").eq("id", courseId).maybeSingle();
      if (data?.start_date) {
        const week = Math.max(1, Math.floor((Date.now() - new Date(data.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
        setCourseCurrentWeek(week);
      }
    };
    fetchCourseWeek();
  }, [courseId]);

  const savePlan = async () => {
    if (!user) return;
    if (!courseId) {
      toast({ title: "No course selected", description: "Cannot save plan without a course context.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Clear isNew flags before saving
      const cleanDays = days.map(d => ({
        ...d,
        resources: d.resources.map(r => { const { isNew, ...rest } = r; return rest; }),
      }));
      const blob = new Blob([JSON.stringify(cleanDays, null, 2)], { type: "application/json" });
      const file = new File([blob], "published-plan.json", { type: "application/json" });
      const publishedPath = canonicalPublishedPath(courseId);
      const { error } = await supabase.storage
        .from(LESSON_PLAN_BUCKET)
        .upload(publishedPath, file, { upsert: true, cacheControl: "0" });
      if (error) throw error;
      // Verify the upload is actually retrievable. Storage occasionally accepts an
      // upload but loses the backing blob, leaving an unreadable file. We re-download
      // and re-parse before recording the publish so a broken file never becomes the
      // source of truth for students.
      const verify = await supabase.storage.from(LESSON_PLAN_BUCKET).download(publishedPath);
      if (!verify.data) throw new Error("Publish verification failed: file is not retrievable. Please try again.");
      try {
        JSON.parse(await verify.data.text());
      } catch {
        throw new Error("Publish verification failed: stored file is corrupted. Please try again.");
      }
      // Record path + publish timestamp on the course row (best-effort).
      await recordPublishedPath(courseId, publishedPath);
      // Mirror per-week metadata into DB so RLS can hide locked weeks from students.
      await upsertPublishedWeeks(
        courseId,
        cleanDays.map((d: any) => ({
          week_number: d.day,
          week_name: d.topic || `Week ${d.day}`,
          overview: d.description || "",
          is_exam_week: !!d.is_exam_week,
          locked: !!d.locked,
          concepts: [],
          resources: d.resources || [],
        })),
      );
      setDays(cleanDays);
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
    const day = days.find(d => d.id === dayId);
    if (!day) return;
    const newLocked = !day.locked;
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, locked: newLocked } : d));
    toast({
      title: newLocked ? "Hidden from students" : "Now visible to students",
      description: newLocked
        ? `Week ${day.day} content is now hidden from students`
        : `Week ${day.day} content is now visible to students`,
    });
    markChanged();
    if (courseId) {
      setWeekLocked(courseId, day.day, newLocked).catch((err) => {
        console.warn("Failed to persist week lock:", err);
      });
    }
  };

  const deleteDay = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, day: i + 1 }))); markChanged();
  };

  const addDay = () => {
    const newDay: DayPlan = {
      id: `d_new_${Date.now()}`, day: days.length + 1, dates: `Week ${days.length + 1}`,
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
    const isExam = newResourceType === "exam";
    const isAutoFill = isQuiz || isExam;
    const newResource: Resource = {
      id: makeId(),
      title: isQuiz ? `Weekly Quiz — Week ${dayNumber}` : isExam ? "Final Exam Simulation" : "",
      action: isQuiz ? "Test your understanding of this week's concepts" : isExam ? "Take the full course exam" : "",
      type: newResourceType,
      accepted: true,
      provenance: "instructor",
    };
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, resources: [...d.resources, newResource] } : d));
    if (!isAutoFill) {
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
          .from("courses").select("objectives, sessions_per_week, session_length_minutes").eq("id", courseId).single();
        if (course?.objectives) objectives = course.objectives;
        var sessionsPerWeek = course?.sessions_per_week;
        var sessionLengthMinutes = course?.session_length_minutes;
      }
      const { data, error } = await supabase.functions.invoke("suggest-lesson", {
        body: {
          dayNumber: day.day, dayTopic: day.topic,
          existingDescription: day.description || "",
          courseObjectives: objectives, totalDays: days.length,
          existingResources: day.resources.map(r => ({ title: r.title, action: r.action })),
          sessionsPerWeek, sessionLengthMinutes,
        },
      });
      if (error) throw error;
      if (data?.error) { toast({ title: "AI suggestion failed", description: data.error, variant: "destructive" }); return; }
      if (data?.suggestion) updateDescription(dayId, data.suggestion);
      if (data?.suggestedResources?.length > 0) {
        const newResources: Resource[] = data.suggestedResources.map((r: any) => ({
          id: makeId(), title: r.title || "Untitled Resource", action: r.action || "",
          type: r.type || "exercise", accepted: true, provenance: r.provenance || "instructor",
          isNew: true, concept: r.concept || "General",
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
    if (user?.id && courseId) void markStepCompleted(user.id, "lesson-plan", courseId, { source: "TeachingPlan.handlePublish" });
    setShowPublishModal(false);
    setPublishChecklist({ days: false, resources: false });
    toast({ title: "Plan published", description: "Students can now see the updated lesson plan." });
  };

  const handleExport = (format: "pdf" | "word") => {
    let content = "LESSON PLAN\n";
    content += `${days.length} Weeks\n\n`;
    days.forEach((d) => {
      content += `Week ${d.day} (${d.dates}): ${d.topic}\n`;
      if (d.description) content += `\nDescription:\n${d.description}\n`;
      content += "\nResources:\n";
      d.resources.forEach((r) => { content += `  - ${r.title}\n    ${r.action}\n`; });
      content += "\n---\n\n";
    });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = format === "pdf" ? "lesson-plan.pdf" : "lesson-plan.doc"; a.click();
    URL.revokeObjectURL(url);
  };

  const inClassTypes = new Set(["exercise", "lab", "tool", "video", "quiz", "exam"]);
  const preClassTypes = new Set(["textbook", "article", "case-study", "news"]);

  const renderDescription = (desc: string, dp: DayPlan) => {
    if (!desc) return null;
    const cleaned = desc.replace(/\*\*/g, "");
    const sections = cleaned.split(/\n(?=[A-Z][^:\n]+:)/);

    const conceptResources = new Map<string, Resource[]>();
    for (const r of dp.resources) {
      const key = r.concept || "General";
      if (!conceptResources.has(key)) conceptResources.set(key, []);
      conceptResources.get(key)!.push(r);
    }

    // Extract concept order and text activities
    const conceptOrder: string[] = [];
    const conceptTextActivities = new Map<string, string[]>();
    for (const section of sections) {
      const hm = section.match(/^(Concepts & Topics|Concepts and Topics):\s*/i);
      if (!hm) continue;
      const body = section.replace(/^[A-Z][^:\n]+:\s*/, "").trim();
      const lines = body.split("\n");
      let current = "";
      for (const line of lines) {
        const cm = line.match(/^Concept:\s*(.+)/i);
        if (cm) {
          current = cm[1].trim();
          conceptOrder.push(current);
          conceptTextActivities.set(current, []);
        } else if (current && line.trim() && !line.trim().startsWith("-")) {
          // This is the concept description line (not a bullet activity)
          const existing = conceptTextActivities.get(current)!;
          if (existing.length === 0 && !line.trim().startsWith("[")) {
            // Store description as a special marker
            conceptTextActivities.get(current)!.push(`__DESC__${line.trim()}`);
          }
        }
        if (current && line.trim().startsWith("-")) {
          conceptTextActivities.get(current)!.push(line.trim().replace(/^-\s*/, ""));
        }
      }
    }
    for (const key of conceptResources.keys()) {
      if (!conceptOrder.includes(key)) conceptOrder.push(key);
    }

    const topTextHeadings = /^(overview|learning outcomes)$/i;
    const bottomTextHeadings = /^(additional tips|tips|teaching tips|strategies|teaching strategies|engagement.*)$/i;

    const renderTextSection = (section: string, i: number) => {
      const headingMatch = section.match(/^([A-Z][^:\n]+):\s*/);
      if (!headingMatch) return null;
      const heading = headingMatch[1];
      const body = section.replace(/^[A-Z][^:\n]+:\s*/, "").trim();
      const lines = body.split("\n").filter(l => l.trim());
      const isList = lines.every(l => /^[-•]/.test(l.trim()));

      return (
        <div key={`${heading}-${i}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{heading}</p>
          {isList ? (
            <ul className="space-y-1 pl-1">
              {lines.map((line, j) => (
                <li key={j} className="text-sm text-foreground/80 flex items-start gap-2">
                  <span className="mt-2 shrink-0 h-1 w-1 rounded-full bg-primary inline-block" />
                  <span>{line.replace(/^[-•]\s*/, "")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/80 leading-relaxed">{body}</p>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-5">
        {sections
          .filter((section) => {
            const heading = section.match(/^([A-Z][^:\n]+):\s*/)?.[1];
            if (!heading || heading === "Concepts & Topics" || heading === "Concepts and Topics") return false;
            return topTextHeadings.test(heading);
          })
          .map(renderTextSection)}

        {conceptOrder.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Concepts & Topics</p>
            {conceptOrder.map((conceptName, ci) => {
              const resources = conceptResources.get(conceptName) || [];
              const textActivities = conceptTextActivities.get(conceptName) || [];
              const inClass = resources.filter(r => !preClassTypes.has(r.type));
              const preClass = resources.filter(r => preClassTypes.has(r.type));

              return (
                <div key={ci} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-muted/40 border-b">
                    <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{ci + 1}</span>
                    </div>
                    {editingConceptName === `${dp.id}::${conceptName}` ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <Input
                          value={editConceptValue}
                          onChange={(e) => setEditConceptValue(e.target.value)}
                          className="h-7 text-sm font-semibold flex-1"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") renameConcept(dp.id, conceptName, editConceptValue); if (e.key === "Escape") setEditingConceptName(null); }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => renameConcept(dp.id, conceptName, editConceptValue)} className="h-6 w-6 p-0"><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingConceptName(null)} className="h-6 w-6 p-0"><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1 group/concept">
                        <p className="text-sm font-semibold text-foreground">{conceptName}</p>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => { setEditingConceptName(`${dp.id}::${conceptName}`); setEditConceptValue(conceptName); }}
                          className="h-5 w-5 p-0 opacity-0 group-hover/concept:opacity-100 transition-opacity"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3 space-y-4">
                    {textActivities.filter(a => a.startsWith("__DESC__")).length > 0 && (
                      <p className="text-sm text-muted-foreground italic">
                        {textActivities.find(a => a.startsWith("__DESC__"))?.replace("__DESC__", "")}
                      </p>
                    )}

                    {textActivities.filter(a => !a.startsWith("__DESC__")).length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">What's Covered</p>
                        <ul className="space-y-1 pl-1">
                          {textActivities.filter(a => !a.startsWith("__DESC__")).map((act, ai) => {
                            const typeMatch = act.match(/^\[([^\]]+)\]\s*/);
                            const typeBadge = typeMatch ? typeMatch[1] : null;
                            const text = typeMatch ? act.replace(/^\[[^\]]+\]\s*/, "") : act;
                            return (
                              <li key={ai} className="text-sm text-foreground/80 flex items-start gap-2">
                                {typeBadge ? (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 mt-0.5 shrink-0 font-medium">{typeBadge}</Badge>
                                ) : (
                                  <span className="mt-2 shrink-0 h-1 w-1 rounded-full bg-primary inline-block" />
                                )}
                                <span>{text}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {inClass.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5 flex items-center gap-1.5">
                          <BookOpen className="h-3 w-3" /> In Class
                        </p>
                        <div className="space-y-1">
                          {inClass.map(r => renderInlineResource(r, dp, conceptOrder))}
                        </div>
                      </div>
                    )}

                    {preClass.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5 flex items-center gap-1.5">
                          <FileText className="h-3 w-3" /> Readings & Preparation
                        </p>
                        <div className="space-y-1">
                          {preClass.map(r => renderInlineResource(r, dp, conceptOrder))}
                        </div>
                      </div>
                    )}

                    {resources.length === 0 && textActivities.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No resources mapped yet — use AI Suggest or add manually</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sections
          .filter((section) => {
            const heading = section.match(/^([A-Z][^:\n]+):\s*/)?.[1];
            if (!heading || heading === "Concepts & Topics" || heading === "Concepts and Topics") return false;
            return bottomTextHeadings.test(heading);
          })
          .map(renderTextSection)}
      </div>
    );
  };

  const renderInlineResource = (r: Resource, dp: DayPlan, concepts?: string[]) => {
    const isEditingThis = editingResourceId === r.id;
    if (isEditingThis) {
      return (
        <div key={r.id} className="rounded-md border bg-background p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={editResourceType} onValueChange={(v) => setEditResourceType(v as Resource["type"])}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {resourceTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-7 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={editResourceAction} onChange={(e) => setEditResourceAction(e.target.value)} className="h-7 text-xs" />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => saveEditResource(dp.id)} className="h-6 text-xs px-2">Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingResourceId(null)} className="h-6 text-xs px-2">Cancel</Button>
          </div>
        </div>
      );
    }
    const isInClass = inClassTypes.has(r.type);
    return (
      <div key={r.id} className={`flex items-start gap-2.5 rounded-md px-3 py-2 group hover:bg-muted/30 transition-colors ${r.isNew ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
        <span className="text-sm shrink-0 mt-0.5">{typeIcons[r.type] || "📄"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium">{r.title || "Untitled"}</span>
            {r.isNew && <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20 px-1 py-0">AI</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{r.action}</p>
        </div>
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" onClick={() => toggleResourceCategory(dp.id, r.id)} className="h-6 px-1.5" title={isInClass ? "Move to Readings" : "Move to In Class"}>
            <ArrowLeftRight className="h-3 w-3" />
          </Button>
          {concepts && concepts.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1.5" title="Move to concept">
                  <GripVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                {concepts.filter(c => c !== r.concept).map(c => (
                  <DropdownMenuItem key={c} onClick={() => moveResourceToConcept(dp.id, r.id, c)} className="text-xs">
                    Move to {c}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-6 w-6 p-0">
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => removeResource(dp.id, r.id)} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
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
    <div className={embedded ? "space-y-6" : "p-6 max-w-5xl mx-auto space-y-6"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        {!embedded && (
          <div>
            <h1 className="font-heading text-3xl font-bold">Lesson Plan</h1>
            <p className="text-muted-foreground text-sm">Edit weekly topics, learning outcomes, resources, and control student visibility</p>
          </div>
        )}
        <div className={`flex items-center gap-2 ${embedded ? "w-full justify-end" : ""}`}>
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

      {/* Guidance Banner — only during setup */}
      {!embedded && (
        <Card className="border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3 p-4">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Your lesson plan is a living document</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You don't need to finalize everything now. Use <strong>AI Suggest</strong> to auto-generate learning outcomes, activities, and resources for each week based on your syllabus. 
                You can edit topics, reorder weeks, control student visibility, and add resources at any time — even after setup is complete. 
                Once published, students will see the latest version on their home page. You can continue editing and re-publishing from the <strong>Lesson Plan & Resources</strong> section in your main navigation.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="plan" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="plan">Weekly Plan</TabsTrigger>
            <TabsTrigger value="materials">Uploaded Materials</TabsTrigger>
          </TabsList>
          <h2 className="text-sm font-medium text-muted-foreground">{days.length} week{days.length !== 1 ? "s" : ""}</h2>
        </div>

        <TabsContent value="materials" className="space-y-4">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Materials uploaded during setup are available here. To upload new materials, use the file upload in course setup.</p>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          {days.length === 0 ? (
            <Card className="p-10 text-center space-y-3">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
              <div>
                <h3 className="text-base font-semibold">No lesson plan yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Upload a syllabus and lesson-plan document in course setup, then generate weeks here. Existing data was cleared.
                </p>
              </div>
            </Card>
          ) : (
          <Reorder.Group axis="y" values={days} onReorder={(newOrder) => { setDays(newOrder.map((d, i) => ({ ...d, day: i + 1 }))); markChanged(); }}>
            <div className="space-y-4">
              {days.map((dp) => {
                const isExpanded = expandedDays.includes(dp.id);
                const isEditing = editingDayId === dp.id;
                const isSuggesting = suggestingDayId === dp.id;

                return (
                  <Reorder.Item key={dp.id} value={dp} className="list-none">
                    <Card className={`overflow-hidden transition-all border-border ${isExpanded ? "shadow-md" : ""}`}>
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
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost" size="sm"
                              onClick={(e) => { e.stopPropagation(); toggleLock(dp.id); }}
                              className="h-7 px-2 text-sm"
                            >
                              {dp.locked ? (
                                dp.day <= courseCurrentWeek && courseCurrentWeek > 0 ? (
                                  <Badge variant="outline" className="text-sm gap-1 border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400">
                                    <Clock className="h-3 w-3" /> Auto-visible (Week {dp.day} reached)
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-sm gap-1 border-destructive/30 text-destructive bg-destructive/5">
                                    <EyeOff className="h-3 w-3" /> Hidden from students
                                  </Badge>
                                )
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
                                <div className="space-y-1.5">
                                  <Label className="text-sm font-medium">Date / Label</Label>
                                  <Input value={editDates} onChange={(e) => setEditDates(e.target.value)} className="h-9 text-sm" />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" onClick={saveEditDay} className="h-8">Save Changes</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingDayId(null)} className="h-8">Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => startEditDay(dp)} className="h-8 text-sm">
                                  <Pencil className="h-3 w-3 mr-1.5" /> Edit Week Info
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteDay(dp.id)} className="h-8 text-sm text-destructive hover:text-destructive">
                                  <Trash2 className="h-3 w-3 mr-1.5" /> Remove Week
                                </Button>
                              </div>
                            )}

                            {/* Lesson Description + Integrated Resources */}
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
                                      {renderDescription(dp.description, dp)}
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
                                      value={dp.description || ""}
                                      onChange={(e) => updateDescription(dp.id, e.target.value)}
                                      placeholder="Describe what this week covers — or click AI Suggest above to auto-generate."
                                      className="min-h-[120px] text-sm leading-relaxed resize-y"
                                    />
                                  )}

                                  {dp.resources.length === 0 && !dp.description && (
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
          )}

          <Button variant="outline" onClick={addDay} className="w-full border-dashed h-11">
            <Plus className="mr-2 h-4 w-4" /> Add Week
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
