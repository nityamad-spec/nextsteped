import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  ChevronDown, ChevronUp, Pencil, GripVertical,
  Plus, Trash2, FileText, BookOpen, Code2, ExternalLink,
  GraduationCap, Eye, EyeOff, Info, Library,
} from "lucide-react";
// SetupProgressBar removed — using top-left "Back to Course Setup" button instead.
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ───
type Concept = {
  id: string;
  name: string;
  brief_description: string;
  ai_suggested: boolean;
};

type Resource = {
  id: string;
  type: "coding-exercise" | "article";
  title: string;
  description: string;
  url?: string;
  ai_suggested: boolean;
};

type WeekPlan = {
  id: string;
  week: number;
  week_name: string;
  overview: string;
  is_exam_week: boolean;
  exam_type: "midterm" | "final" | null;
  concepts: Concept[];
  resources: Resource[];
  locked: boolean;
};

type LessonPlanDraft = {
  weeks?: WeekPlan[];
  expandedWeeks?: string[];
  published?: boolean;
  publishTimestamp?: string | null;
  overallOutcomes?: string;
  gapMode?: boolean;
};

const makeId = () => `i_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ─── Helpers ───
const normalizeWeeks = (list: WeekPlan[]): WeekPlan[] =>
  list
    .slice()
    .sort((a, b) => (a.week || 0) - (b.week || 0))
    .map((w, i) => ({ ...w, week: i + 1 }));

const CourseCreation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const initialCourseId = (location.state as any)?.courseId || localStorage.getItem("currentCourseId");
  const [courseId, setCourseId] = useState<string | null>(initialCourseId);
  const [resolvingCourse, setResolvingCourse] = useState(!initialCourseId);
  const draftLocalKey = `lessonPlanDraftV2:${courseId || user?.id || "default"}`;
  const draftStoragePath = user ? `${user.id}/lesson-plan/draft-plan-v2.json` : null;

  // ─── Auto-recover course when missing (e.g. AUTH_BYPASS admin, fresh load) ───
  useEffect(() => {
    if (courseId || !user) return;
    let cancelled = false;
    (async () => {
      setResolvingCourse(true);
      // Owned course first
      let { data } = await supabase
        .from("courses")
        .select("id")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback: any course (admin / collaborator can see via RLS)
      if (!data) {
        const res = await supabase
          .from("courses")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = res.data;
      }

      if (cancelled) return;
      if (data?.id) {
        setCourseId(data.id);
        localStorage.setItem("currentCourseId", data.id);
      }
      setResolvingCourse(false);
    })();
    return () => { cancelled = true; };
  }, [courseId, user]);

  const [phase, setPhase] = useState<"generating" | "plan">("generating");
  const [genError, setGenError] = useState<string | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);
  const [genStep, setGenStep] = useState(0);
  const [weeks, setWeeksRaw] = useState<WeekPlan[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [restoringDraft, setRestoringDraft] = useState(true);
  const [published, setPublished] = useState(false);
  const [publishTimestamp, setPublishTimestamp] = useState<string | null>(null);
  const [overallOutcomes, setOverallOutcomes] = useState<string>("");
  const [gapMode, setGapMode] = useState<boolean>(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);

  // edit states
  const [editingOverviewId, setEditingOverviewId] = useState<string | null>(null);
  const [editOverviewValue, setEditOverviewValue] = useState("");
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editConceptName, setEditConceptName] = useState("");
  const [editConceptDesc, setEditConceptDesc] = useState("");
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editResourceType, setEditResourceType] = useState<Resource["type"]>("coding-exercise");
  const [editResourceTitle, setEditResourceTitle] = useState("");
  const [editResourceDesc, setEditResourceDesc] = useState("");
  const [editResourceUrl, setEditResourceUrl] = useState("");

  const setWeeks: React.Dispatch<React.SetStateAction<WeekPlan[]>> = (action) => {
    setWeeksRaw(prev => {
      const next = typeof action === "function" ? action(prev) : action;
      return normalizeWeeks(next);
    });
    setPublished(false);
  };

  // ─── Draft restore ───
  const applyDraft = useCallback((draft: LessonPlanDraft) => {
    if (Array.isArray(draft.weeks) && draft.weeks.length > 0) {
      setWeeksRaw(normalizeWeeks(draft.weeks));
      setPhase("plan");
    }
    if (Array.isArray(draft.expandedWeeks)) setExpandedWeeks(draft.expandedWeeks);
    if (typeof draft.published === "boolean") setPublished(draft.published);
    if (draft.publishTimestamp !== undefined) setPublishTimestamp(draft.publishTimestamp ?? null);
    if (typeof draft.overallOutcomes === "string") setOverallOutcomes(draft.overallOutcomes);
    if (typeof draft.gapMode === "boolean") setGapMode(draft.gapMode);
  }, []);

  useEffect(() => {
    if (!user) { setRestoringDraft(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const local = localStorage.getItem(draftLocalKey);
        if (local) { applyDraft(JSON.parse(local)); return; }
        if (draftStoragePath) {
          const { data, error } = await supabase.storage.from("course-materials").download(draftStoragePath);
          if (!error && data) applyDraft(JSON.parse(await data.text()));
        }
      } catch (e) {
        console.error("Failed to restore draft:", e);
      } finally {
        if (!cancelled) setRestoringDraft(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, draftLocalKey, draftStoragePath, applyDraft]);

  // ─── Persist draft ───
  useEffect(() => {
    if (!user || restoringDraft) return;
    const draft: LessonPlanDraft = { weeks, expandedWeeks, published, publishTimestamp, overallOutcomes, gapMode };
    const serialized = JSON.stringify(draft);
    localStorage.setItem(draftLocalKey, serialized);
    if (!draftStoragePath || weeks.length === 0) return;
    const t = window.setTimeout(async () => {
      try {
        const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
        const file = new File([blob], "draft-plan-v2.json", { type: "application/json" });
        await supabase.storage.from("course-materials").upload(draftStoragePath, file, { upsert: true, cacheControl: "0" });
      } catch (e) {
        console.error("draft persist failed:", e);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [weeks, expandedWeeks, published, publishTimestamp, overallOutcomes, gapMode, user, restoringDraft, draftLocalKey, draftStoragePath]);

  // ─── Generation ───
  const runGeneration = useCallback(async () => {
    if (!courseId) {
      setGenError("No course selected. Please complete course setup first.");
      return;
    }
    setGenError(null);
    setGenStep(0);
    setGenElapsed(0);
    const stepTimer = setInterval(() => setGenStep(s => Math.min(s + 1, 2)), 8000);
    const elapsedTimer = setInterval(() => setGenElapsed(e => e + 1), 1000);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lesson-plan", {
        body: { courseId },
      });
      clearInterval(stepTimer);
      clearInterval(elapsedTimer);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.weeks) || data.weeks.length === 0) {
        throw new Error("AI returned no weeks. Please try regenerating.");
      }

      const generated: WeekPlan[] = data.weeks.map((w: any, i: number) => ({
        id: `w_${i + 1}_${Date.now()}`,
        week: w.week ?? i + 1,
        week_name: w.week_name || "",
        overview: w.overview || "",
        is_exam_week: !!w.is_exam_week,
        exam_type: w.exam_type ?? null,
        concepts: (w.concepts || []).map((c: any) => ({
          id: makeId(),
          name: c.name || "Untitled concept",
          brief_description: c.brief_description || "",
          ai_suggested: !!c.ai_suggested,
        })),
        resources: (w.resources || []).map((r: any) => ({
          id: makeId(),
          type: r.type === "article" ? "article" : "coding-exercise",
          title: r.title || "Untitled",
          description: r.description || "",
          url: r.url || undefined,
          ai_suggested: !!r.ai_suggested,
        })),
        locked: i > 0,
      }));

      setWeeksRaw(normalizeWeeks(generated));
      setExpandedWeeks(generated.length > 0 ? [generated[0].id] : []);
      setOverallOutcomes(typeof data.overall_course_learning_outcomes === "string" ? data.overall_course_learning_outcomes : "");
      setGapMode(!!data.meta?.gapMode);
      setGenStep(2);
      setTimeout(() => setPhase("plan"), 500);
    } catch (err: any) {
      clearInterval(stepTimer);
      clearInterval(elapsedTimer);
      console.error("Lesson plan generation failed:", err);
      setGenError(err?.message || "Failed to generate lesson plan");
    }
  }, [courseId]);

  useEffect(() => {
    if (restoringDraft) return;
    if (resolvingCourse) return;
    if (!user) return;
    if (phase !== "generating") return;
    if (weeks.length > 0) { setPhase("plan"); return; }
    if (!courseId) {
      setGenError("No course found yet. Start by uploading materials in Course Materials, then return here.");
      return;
    }
    runGeneration();
  }, [phase, weeks.length, restoringDraft, runGeneration, user, resolvingCourse, courseId]);

  // ─── Week handlers ───
  const toggleWeek = (id: string) =>
    setExpandedWeeks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleLock = (id: string) => {
    const w = weeks.find(x => x.id === id);
    setWeeks(prev => prev.map(x => x.id === id ? { ...x, locked: !x.locked } : x));
    toast({
      title: w?.locked ? "Now visible to students" : "Hidden from students",
      description: `Week ${w?.week} ${w?.locked ? "is now visible" : "is now hidden"}.`,
    });
  };

  const deleteWeek = (id: string) => {
    setWeeks(prev => prev.filter(x => x.id !== id));
  };

  const addWeek = () => {
    const newWeek: WeekPlan = {
      id: `w_new_${Date.now()}`,
      week: weeks.length + 1,
      week_name: "",
      overview: "",
      is_exam_week: false,
      exam_type: null,
      concepts: [],
      resources: [],
      locked: true,
    };
    setWeeks(prev => [...prev, newWeek]);
    setExpandedWeeks(prev => [...prev, newWeek.id]);
  };

  // ─── Overview ───
  const startEditOverview = (w: WeekPlan) => {
    setEditingOverviewId(w.id);
    setEditOverviewValue(w.overview);
  };
  const saveOverview = () => {
    if (!editingOverviewId) return;
    setWeeks(prev => prev.map(w => w.id === editingOverviewId ? { ...w, overview: editOverviewValue } : w));
    setEditingOverviewId(null);
  };

  // ─── Concept handlers ───
  const startEditConcept = (c: Concept) => {
    setEditingConceptId(c.id);
    setEditConceptName(c.name);
    setEditConceptDesc(c.brief_description);
  };
  const saveConcept = (weekId: string) => {
    if (!editingConceptId) return;
    setWeeks(prev => prev.map(w => w.id === weekId ? {
      ...w,
      concepts: w.concepts.map(c => c.id === editingConceptId
        ? { ...c, name: editConceptName.trim(), brief_description: editConceptDesc.trim() }
        : c),
    } : w));
    setEditingConceptId(null);
  };
  const deleteConcept = (weekId: string, conceptId: string) => {
    setWeeks(prev => prev.map(w => w.id === weekId ? {
      ...w, concepts: w.concepts.filter(c => c.id !== conceptId),
    } : w));
  };
  const addConcept = (weekId: string) => {
    const c: Concept = { id: makeId(), name: "New concept", brief_description: "", ai_suggested: false };
    setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, concepts: [...w.concepts, c] } : w));
    startEditConcept(c);
  };
  const moveConceptToWeek = (fromWeekId: string, conceptId: string, toWeekId: string) => {
    setWeeks(prev => {
      const concept = prev.find(w => w.id === fromWeekId)?.concepts.find(c => c.id === conceptId);
      if (!concept) return prev;
      return prev.map(w => {
        if (w.id === fromWeekId) return { ...w, concepts: w.concepts.filter(c => c.id !== conceptId) };
        if (w.id === toWeekId) return { ...w, concepts: [...w.concepts, concept] };
        return w;
      });
    });
    toast({ title: "Concept moved", description: `Moved to Week ${weeks.find(w => w.id === toWeekId)?.week}` });
  };

  // ─── Resource handlers ───
  const startEditResource = (r: Resource) => {
    setEditingResourceId(r.id);
    setEditResourceType(r.type);
    setEditResourceTitle(r.title);
    setEditResourceDesc(r.description);
    setEditResourceUrl(r.url || "");
  };
  const saveResource = (weekId: string) => {
    if (!editingResourceId) return;
    setWeeks(prev => prev.map(w => w.id === weekId ? {
      ...w,
      resources: w.resources.map(r => r.id === editingResourceId ? {
        ...r,
        type: editResourceType,
        title: editResourceTitle.trim(),
        description: editResourceDesc.trim(),
        url: editResourceUrl.trim() || undefined,
      } : r),
    } : w));
    setEditingResourceId(null);
  };
  const deleteResource = (weekId: string, resourceId: string) => {
    setWeeks(prev => prev.map(w => w.id === weekId ? {
      ...w, resources: w.resources.filter(r => r.id !== resourceId),
    } : w));
  };
  const addResource = (weekId: string, type: Resource["type"]) => {
    const r: Resource = {
      id: makeId(),
      type,
      title: "New resource",
      description: "",
      url: undefined,
      ai_suggested: false,
    };
    setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, resources: [...w.resources, r] } : w));
    startEditResource(r);
  };
  const moveResourceToWeek = (fromWeekId: string, resourceId: string, toWeekId: string) => {
    setWeeks(prev => {
      const resource = prev.find(w => w.id === fromWeekId)?.resources.find(r => r.id === resourceId);
      if (!resource) return prev;
      return prev.map(w => {
        if (w.id === fromWeekId) return { ...w, resources: w.resources.filter(r => r.id !== resourceId) };
        if (w.id === toWeekId) return { ...w, resources: [...w.resources, resource] };
        return w;
      });
    });
    toast({ title: "Resource moved", description: `Moved to Week ${weeks.find(w => w.id === toWeekId)?.week}` });
  };

  // ─── Publish ───
  const handlePublish = async () => {
    setPublished(true);
    setPublishTimestamp(new Date().toLocaleString());
    setShowPublishModal(false);
    setPublishChecklist({ overview: false, concepts: false, resources: false });
    if (user) {
      try {
        const payload = { weeks, overall_course_learning_outcomes: overallOutcomes };
        const planJson = JSON.stringify(payload, null, 2);
        const blob = new Blob([planJson], { type: "application/json" });
        const file = new File([blob], "published-plan.json", { type: "application/json" });
        await supabase.storage
          .from("course-materials")
          .upload(`${user.id}/lesson-plan/published-plan.json`, file, { upsert: true, cacheControl: "0" });
      } catch (err) {
        console.error("Failed to save published plan:", err);
      }
    }
  };

  // ─── Generation phase UI ───
  const genSteps = [
    { label: "Reading uploaded materials", desc: "Parsing your syllabus, lesson plans, and course documents" },
    { label: "Mapping weekly topics", desc: "Building concept progression with prerequisites first" },
    { label: "Generating resources & exercises", desc: "Industry-relevant coding tasks and current articles" },
  ];

  if (restoringDraft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading your lesson plan…
        </div>
      </div>
    );
  }

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
          {genError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 text-left">
              <p className="text-sm font-medium text-destructive">Generation failed</p>
              <p className="text-xs text-muted-foreground">{genError}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={runGeneration}>Retry</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/teacher/setup/upload")}>Back to materials</Button>
              </div>
            </div>
          )}
          {!genError && genElapsed > 90 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium">This is taking longer than usual.</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={runGeneration}>Retry generation</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── PLAN PHASE ───
  const allChecked = publishChecklist.overview && publishChecklist.concepts && publishChecklist.resources;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-6">
        {/* Top-left return navigation (replaces SetupProgressBar) */}
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Course Setup
          </Button>
        </div>

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="font-heading text-3xl font-bold">
            AI <span className="text-primary">Lesson Plan</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Generated from your uploaded syllabus, lesson plans, and course materials. Each week has key concepts and industry-relevant resources. Edit anything — move concepts and resources between weeks, add your own, or remove AI suggestions.
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

        {/* How this works — publish-then-iterate guidance */}
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-foreground/80 leading-relaxed">
              <p className="font-semibold text-foreground">How the lesson plan works</p>
              <ul className="space-y-1.5 list-disc pl-5">
                <li>
                  <span className="font-medium text-foreground">Publish once you're happy with the structure.</span> Publishing makes the plan available to your AI Teaching Assistant and unlocks the rest of course setup. You don't need every week perfected before publishing.
                </li>
                <li>
                  <span className="font-medium text-foreground">Keep editing future weeks anytime.</span> After publishing, you can return to <span className="font-medium">Course Setup → AI Lesson Plan</span> (or the <span className="font-medium">Content Library → Lesson Plan</span> tab) to refine upcoming weeks, swap resources, or add concepts as the term unfolds. Re-publish to push your changes live.
                </li>
                <li>
                  <span className="font-medium text-foreground">Show or hide weeks as you teach.</span> Use the <Eye className="inline h-3.5 w-3.5 align-text-bottom" /> / <EyeOff className="inline h-3.5 w-3.5 align-text-bottom" /> toggle on each week to control visibility — students only see weeks you've made visible, and the AI Teaching Assistant + exam questions stay constrained to those visible topics.
                </li>
                <li>
                  <span className="font-medium text-foreground">Reorder freely.</span> Drag weeks to reorder; numbering updates automatically.
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {gapMode && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
            Since you've uploaded existing teaching materials, the plan below highlights gaps and additions not already covered in what you've shared.
          </div>
        )}

        {/* Overall Course Learning Outcomes — shown FIRST, before Week 1 */}
        <Card className="p-5 space-y-3 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-primary" />
            <Label className="text-base font-semibold">Overall Course Learning Outcomes</Label>
          </div>
          <Textarea
            value={overallOutcomes}
            onChange={(e) => { setOverallOutcomes(e.target.value); setPublished(false); }}
            rows={4}
            placeholder="A short paragraph summarizing what students will be able to do by the end of the course."
            className="text-sm"
          />
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Weekly Breakdown</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm("Regenerate the lesson plan from your uploaded materials? This will replace the current plan.")) {
                setWeeksRaw([]);
                setExpandedWeeks([]);
                localStorage.removeItem(draftLocalKey);
                setPhase("generating");
              }
            }}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Regenerate
          </Button>
        </div>

        {/* Week Cards */}
        <Reorder.Group
          axis="y"
          values={weeks}
          onReorder={(newOrder) => setWeeks(newOrder)}
        >
          <div className="space-y-3">
            {weeks.map((w) => {
              const isExpanded = expandedWeeks.includes(w.id);
              return (
                <Reorder.Item key={w.id} value={w} className="list-none">
                  <Card className={`overflow-hidden transition-all ${isExpanded ? "shadow-md" : ""} ${w.is_exam_week ? "border-amber-500/40" : ""}`}>
                    {/* Header */}
                    <div className="flex items-center gap-1 px-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                      <button
                        onClick={() => toggleWeek(w.id)}
                        className="flex flex-1 items-center justify-between px-3 py-3.5 text-left hover:bg-muted/20 transition-colors rounded"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 text-sm font-bold ${
                            w.is_exam_week ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"
                          }`}>
                            {w.week}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">
                                Week {w.week}
                                {w.week_name ? <span className="text-muted-foreground font-normal"> — {w.week_name}</span> : null}
                              </p>
                              {w.is_exam_week && (
                                <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary bg-primary/10">
                                  <GraduationCap className="h-2.5 w-2.5" />
                                  {w.exam_type === "midterm" ? "Midterm" : w.exam_type === "final" ? "Final" : "Exam"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); toggleLock(w.id); }}
                            className="h-7 px-2"
                          >
                            {w.locked ? (
                              <Badge variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive bg-destructive/5">
                                <EyeOff className="h-2.5 w-2.5" /> Hidden
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary bg-primary/5">
                                <Eye className="h-2.5 w-2.5" /> Visible
                              </Badge>
                            )}
                          </Button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                    </div>

                    {/* Expanded body */}
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t">
                        <div className="px-5 py-5 space-y-6">
                          {/* Concepts */}
                          <section className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-1 rounded-full bg-primary" />
                                <Label className="text-sm font-semibold">Topics Covered</Label>
                                <Badge variant="secondary" className="text-[10px]">{w.concepts.length}</Badge>
                              </div>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => addConcept(w.id)}>
                                <Plus className="h-3 w-3" /> Add topic
                              </Button>
                            </div>

                            {w.concepts.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed rounded">
                                No concepts yet. Click "Add concept" or regenerate.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {w.concepts.map((c, ci) => (
                                  <div key={c.id} className="rounded-lg border bg-muted/10 p-3 group/concept">
                                    {editingConceptId === c.id ? (
                                      <div className="space-y-2">
                                        <Input
                                          value={editConceptName}
                                          onChange={(e) => setEditConceptName(e.target.value)}
                                          placeholder="Concept name"
                                          className="h-8 text-sm font-semibold"
                                        />
                                        <Textarea
                                          value={editConceptDesc}
                                          onChange={(e) => setEditConceptDesc(e.target.value)}
                                          placeholder="One short sentence describing this concept"
                                          rows={2}
                                          className="text-xs"
                                        />
                                        <div className="flex gap-2">
                                          <Button size="sm" onClick={() => saveConcept(w.id)} className="h-7 text-xs">Save</Button>
                                          <Button size="sm" variant="ghost" onClick={() => setEditingConceptId(null)} className="h-7 text-xs">Cancel</Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                          <span className="text-xs font-bold text-primary">{ci + 1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold">{c.name}</p>
                                            {c.ai_suggested && (
                                              <Badge variant="outline" className="text-[9px] gap-0.5 bg-primary/10 text-primary border-primary/30 px-1.5 py-0">
                                                <Sparkles className="h-2.5 w-2.5" /> AI Suggested
                                              </Badge>
                                            )}
                                          </div>
                                          {c.brief_description && (
                                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.brief_description}</p>
                                          )}
                                        </div>
                                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/concept:opacity-100 transition-opacity">
                                          {weeks.length > 1 && (
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-6 px-1.5" title="Move to another week">
                                                  <ArrowRight className="h-3 w-3" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                                                {weeks.filter(other => other.id !== w.id).map(other => (
                                                  <DropdownMenuItem key={other.id} onClick={() => moveConceptToWeek(w.id, c.id, other.id)} className="text-xs">
                                                    Move to Week {other.week}
                                                  </DropdownMenuItem>
                                                ))}
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          )}
                                          <Button variant="ghost" size="sm" onClick={() => startEditConcept(c)} className="h-6 w-6 p-0">
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => deleteConcept(w.id, c.id)} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          {/* Resources */}
                          <section className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-1 rounded-full bg-primary" />
                                <Label className="text-sm font-semibold">Industry-Relevant Exercise &amp; Suggested Articles</Label>
                                <Badge variant="secondary" className="text-[10px]">{w.resources.length}</Badge>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                                    <Plus className="h-3 w-3" /> Add resource
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => addResource(w.id, "coding-exercise")} className="text-xs">
                                    <Code2 className="h-3 w-3 mr-2" /> Industry-Relevant Exercise
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => addResource(w.id, "article")} className="text-xs">
                                    <FileText className="h-3 w-3 mr-2" /> Article / Resource
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <p className="text-[11px] text-muted-foreground -mt-1">
                              Exactly 1 industry-relevant exercise and 1–2 suggested articles per week.
                            </p>

                            {w.resources.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed rounded">
                                No resources yet. Click "Add resource" or regenerate.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {w.resources.map((r) => (
                                  <div key={r.id} className="rounded-lg border bg-background p-3 group/resource">
                                    {editingResourceId === r.id ? (
                                      <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <Label className="text-xs">Type</Label>
                                            <Select value={editResourceType} onValueChange={(v) => setEditResourceType(v as Resource["type"])}>
                                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="coding-exercise">Coding Exercise</SelectItem>
                                                <SelectItem value="article">Article</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <div>
                                            <Label className="text-xs">Title</Label>
                                            <Input value={editResourceTitle} onChange={(e) => setEditResourceTitle(e.target.value)} className="h-8 text-xs" />
                                          </div>
                                        </div>
                                        <div>
                                          <Label className="text-xs">{editResourceType === "coding-exercise" ? "Prompt / task description" : "Summary"}</Label>
                                          <Textarea value={editResourceDesc} onChange={(e) => setEditResourceDesc(e.target.value)} rows={2} className="text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-xs">URL {editResourceType === "article" ? "(required)" : "(optional)"}</Label>
                                          <Input value={editResourceUrl} onChange={(e) => setEditResourceUrl(e.target.value)} className="h-8 text-xs" placeholder="https://..." />
                                        </div>
                                        <div className="flex gap-2">
                                          <Button size="sm" onClick={() => saveResource(w.id)} className="h-7 text-xs">Save</Button>
                                          <Button size="sm" variant="ghost" onClick={() => setEditingResourceId(null)} className="h-7 text-xs">Cancel</Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-start gap-3">
                                        <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                                          r.type === "coding-exercise"
                                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                                        }`}>
                                          {r.type === "coding-exercise" ? <Code2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                              {r.type === "coding-exercise" ? "Coding Exercise" : "Article"}
                                            </Badge>
                                            {r.url ? (
                                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:underline text-primary inline-flex items-center gap-1">
                                                {r.title} <ExternalLink className="h-3 w-3" />
                                              </a>
                                            ) : (
                                              <p className="text-sm font-semibold">{r.title}</p>
                                            )}
                                            {r.ai_suggested && (
                                              <Badge variant="outline" className="text-[9px] gap-0.5 bg-primary/10 text-primary border-primary/30 px-1.5 py-0">
                                                <Sparkles className="h-2.5 w-2.5" /> AI Suggested
                                              </Badge>
                                            )}
                                          </div>
                                          {r.description && (
                                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">{r.description}</p>
                                          )}
                                        </div>
                                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/resource:opacity-100 transition-opacity">
                                          {weeks.length > 1 && (
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-6 px-1.5" title="Move to another week">
                                                  <ArrowRight className="h-3 w-3" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                                                {weeks.filter(other => other.id !== w.id).map(other => (
                                                  <DropdownMenuItem key={other.id} onClick={() => moveResourceToWeek(w.id, r.id, other.id)} className="text-xs">
                                                    Move to Week {other.week}
                                                  </DropdownMenuItem>
                                                ))}
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          )}
                                          <Button variant="ghost" size="sm" onClick={() => startEditResource(r)} className="h-6 w-6 p-0">
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => deleteResource(w.id, r.id)} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          {/* Key Concepts to Include — last 1–2 concepts highlighted */}
                          {w.concepts.length > 0 && (
                            <section className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-1 rounded-full bg-primary" />
                                <Label className="text-sm font-semibold">Key Concepts to Include</Label>
                              </div>
                              <ul className="text-xs text-foreground/80 space-y-1 pl-4 list-disc">
                                {w.concepts.slice(-2).map((kc) => (
                                  <li key={`key-${kc.id}`}>
                                    <span className="font-semibold">{kc.name}</span>
                                    {kc.brief_description ? <span className="text-muted-foreground"> — {kc.brief_description}</span> : null}
                                  </li>
                                ))}
                              </ul>
                              <p className="text-[10px] text-muted-foreground">
                                Concepts students must understand by the end of this week.
                              </p>
                            </section>
                          )}

                          {/* Week actions */}
                          <div className="flex justify-end gap-2 pt-2 border-t">
                            <Button size="sm" variant="ghost" onClick={() => deleteWeek(w.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3 mr-1.5" /> Remove Week
                            </Button>
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

        {/* Add week */}
        <Button variant="outline" onClick={addWeek} className="w-full">
          <Plus className="mr-2 h-4 w-4" /> Add another week
        </Button>

        {/* Overall Course Learning Outcomes is now shown at the top, before Week 1. */}

        {/* Footer actions */}
        <div className="flex justify-between gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => navigate("/teacher/setup/materials")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Materials
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPublishModal(true)} disabled={weeks.length === 0}>
              {published ? "Re-publish Plan" : "Publish Plan"}
            </Button>
            <Button onClick={() => navigate("/teacher/setup/diagnostic")} disabled={weeks.length === 0}>
              Continue to Diagnostic <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Publish modal */}
      <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish lesson plan?</DialogTitle>
            <DialogDescription>
              Publishing makes this plan live for your AI Teaching Assistant and unlocks the next setup steps. Students only see weeks you've marked <span className="inline-flex items-center gap-1 font-medium"><Eye className="h-3 w-3" /> Visible</span>. You can keep editing future weeks anytime from Course Setup or the Content Library — just re-publish to push updates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={publishChecklist.overview}
                onCheckedChange={(v) => setPublishChecklist(p => ({ ...p, overview: !!v }))}
                className="mt-0.5"
              />
              <span className="text-sm">I reviewed each week's overview</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={publishChecklist.concepts}
                onCheckedChange={(v) => setPublishChecklist(p => ({ ...p, concepts: !!v }))}
                className="mt-0.5"
              />
              <span className="text-sm">I reviewed the concepts in each week</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={publishChecklist.resources}
                onCheckedChange={(v) => setPublishChecklist(p => ({ ...p, resources: !!v }))}
                className="mt-0.5"
              />
              <span className="text-sm">I reviewed the resources and exercises</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPublishModal(false)}>Cancel</Button>
            <Button onClick={handlePublish} disabled={!allChecked}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourseCreation;
