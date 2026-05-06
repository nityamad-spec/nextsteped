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
import { Progress } from "@/components/ui/progress";
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
  GraduationCap, Eye, EyeOff, Info, Library, RefreshCw,
} from "lucide-react";
// SetupProgressBar removed — using top-left "Back to Course Setup" button instead.
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  canonicalPublishedPath,
  canonicalDraftPath,
  recordPublishedPath,
  recordDraftPathIfMissing,
  LESSON_PLAN_BUCKET,
} from "@/lib/lessonPlanPath";
import { upsertPublishedWeeks, setWeekLocked } from "@/lib/lessonPlanWeeks";
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

type ScheduleSnapshot = {
  total_weeks: number | null;
  midterm_week: number | null;
  final_week: number | null;
};

type LessonPlanDraft = {
  weeks?: WeekPlan[];
  expandedWeeks?: string[];
  published?: boolean;
  publishTimestamp?: string | null;
  overallOutcomes?: string;
  gapMode?: boolean;
  lastGeneratedSchedule?: ScheduleSnapshot | null;
};

const makeId = () => `i_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ─── Helpers ───
const normalizeWeeks = (list: WeekPlan[]): WeekPlan[] =>
  list
    .slice()
    .sort((a, b) => (a.week || 0) - (b.week || 0))
    .map((w, i) => ({ ...w, week: i + 1 }));

interface CourseCreationProps {
  embedded?: boolean;
}

const CourseCreation = ({ embedded = false }: CourseCreationProps = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const initialCourseId = (location.state as any)?.courseId || localStorage.getItem("currentCourseId");
  const [courseId, setCourseId] = useState<string | null>(initialCourseId);
  const [resolvingCourse, setResolvingCourse] = useState(!initialCourseId);
  const draftLocalKey = `lessonPlanDraftV2:${courseId || user?.id || "default"}`;
  const draftStoragePath = courseId ? canonicalDraftPath(courseId) : null;

  // ─── Course schedule settings (Total Weeks / Midterm / Final) ───
  const [totalWeeks, setTotalWeeks] = useState<number | null>(null);
  const [midtermWeek, setMidtermWeek] = useState<number | null>(null);
  const [finalWeek, setFinalWeek] = useState<number | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(true);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showRegenFromScratchConfirm, setShowRegenFromScratchConfirm] = useState(false);
  const [regeneratingWeekId, setRegeneratingWeekId] = useState<string | null>(null);
  const [confirmRegenWeekId, setConfirmRegenWeekId] = useState<string | null>(null);

  // ─── Auto-recover / validate course (handles missing or stale localStorage IDs) ───
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setResolvingCourse(true);

      // 1. If we have a stored courseId, verify it still exists
      if (courseId) {
        const { data: existing } = await supabase
          .from("courses")
          .select("id")
          .eq("id", courseId)
          .maybeSingle();
        if (cancelled) return;
        if (existing?.id) {
          setResolvingCourse(false);
          return;
        }
        // Stale ID — clear it and fall through to recovery
        console.warn("Stored courseId no longer exists, recovering:", courseId);
        localStorage.removeItem("currentCourseId");
        setCourseId(null);
      }

      // 2. Recover: owned course first
      let { data } = await supabase
        .from("courses")
        .select("id")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Fallback: any course visible via RLS (admin / collaborator)
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

  // ─── Load course schedule (total_weeks / midterm / final) ───
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("total_weeks, midterm_week, final_week")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      const tw = data?.total_weeks ?? 16;
      const mw = data?.midterm_week ?? null;
      const fw = data?.final_week ?? null;
      setTotalWeeks(tw);
      setMidtermWeek(mw);
      setFinalWeek(fw);
      // Auto-expand the schedule card if anything is unset
      setScheduleExpanded(!data?.total_weeks || (mw == null && fw == null));
      setScheduleLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  // Persist a single schedule field to the courses table
  const persistSchedule = useCallback(async (patch: { total_weeks?: number; midterm_week?: number | null; final_week?: number | null }) => {
    if (!courseId) return;
    const { error } = await supabase.from("courses").update(patch).eq("id", courseId);
    if (error) {
      toast({ title: "Could not save schedule", description: error.message, variant: "destructive" });
    }
  }, [courseId, toast]);

  const [phase, setPhase] = useState<"idle" | "generating" | "plan">("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [noConceptsError, setNoConceptsError] = useState(false);
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
  const [lastGeneratedSchedule, setLastGeneratedSchedule] = useState<ScheduleSnapshot | null>(null);

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
    if (draft.lastGeneratedSchedule !== undefined) setLastGeneratedSchedule(draft.lastGeneratedSchedule ?? null);
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

  // Backfill: if this course was published before lesson_plan_weeks existed,
  // mirror the loaded weeks into the table so student RLS visibility works.
  // Runs at most once per course load when DB has zero rows.
  const [backfilled, setBackfilled] = useState(false);
  useEffect(() => {
    if (!courseId || restoringDraft || backfilled) return;
    if (!published || weeks.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from("lesson_plan_weeks")
          .select("week_number", { count: "exact", head: true })
          .eq("course_id", courseId);
        if (cancelled) return;
        if ((count ?? 0) === 0) {
          await upsertPublishedWeeks(
            courseId,
            weeks.map((w) => ({
              week_number: w.week,
              week_name: w.week_name,
              overview: w.overview,
              is_exam_week: w.is_exam_week,
              locked: w.locked,
              concepts: w.concepts,
              resources: w.resources,
            })),
            overallOutcomes,
          );
        }
      } catch (e) {
        console.warn("Lesson plan backfill failed:", e);
      } finally {
        if (!cancelled) setBackfilled(true);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, restoringDraft, backfilled, published, weeks, overallOutcomes]);

  // ─── Persist draft ───
  useEffect(() => {
    if (!user || restoringDraft) return;
    const draft: LessonPlanDraft = { weeks, expandedWeeks, published, publishTimestamp, overallOutcomes, gapMode, lastGeneratedSchedule };
    const serialized = JSON.stringify(draft);
    localStorage.setItem(draftLocalKey, serialized);
    if (!draftStoragePath || weeks.length === 0) return;
    const t = window.setTimeout(async () => {
      try {
        const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
        const file = new File([blob], "draft-plan-v2.json", { type: "application/json" });
        await supabase.storage.from("course-materials").upload(draftStoragePath, file, { upsert: true, cacheControl: "0" });
        // Record draft path on courses row (only if missing — avoids write amplification)
        if (courseId) await recordDraftPathIfMissing(courseId, draftStoragePath);
      } catch (e) {
        console.error("draft persist failed:", e);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [weeks, expandedWeeks, published, publishTimestamp, overallOutcomes, gapMode, lastGeneratedSchedule, user, restoringDraft, draftLocalKey, draftStoragePath, courseId]);

  // ─── Generation ───
  const runGeneration = useCallback(async () => {
    if (!courseId) {
      setGenError("No course selected. Please complete course setup first.");
      return;
    }
    setPhase("generating");
    setGenError(null);
    setNoConceptsError(false);
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
      if (data?.error) {
        if (data?.code === "NO_CONCEPTS") {
          setNoConceptsError(true);
          setGenError(data.error);
          return;
        }
        throw new Error(data.error);
      }
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
      setGapMode(false);
      setLastGeneratedSchedule({ total_weeks: totalWeeks, midterm_week: midtermWeek, final_week: finalWeek });
      setGenStep(2);
      setTimeout(() => setPhase("plan"), 500);
    } catch (err: any) {
      clearInterval(stepTimer);
      clearInterval(elapsedTimer);
      console.error("Lesson plan generation failed:", err);
      setGenError(err?.message || "Failed to generate lesson plan");
    }
  }, [courseId, totalWeeks, midtermWeek, finalWeek]);

  // ─── Regenerate a single week (preserves concept assignments) ───
  const regenerateWeek = useCallback(async (weekId: string) => {
    if (!courseId) return;
    const target = weeks.find(w => w.id === weekId);
    if (!target) return;
    setRegeneratingWeekId(weekId);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-lesson-plan-week", {
        body: {
          courseId,
          week: target.week,
          is_exam_week: target.is_exam_week,
          exam_type: target.exam_type,
          concept_names: target.concepts.map(c => c.name),
          context_weeks: weeks.map(w => ({
            week: w.week,
            week_name: w.week_name,
            concept_names: w.concepts.map(c => c.name),
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWeeks(prev => prev.map(w => w.id !== weekId ? w : ({
        ...w,
        week_name: typeof data.week_name === "string" ? data.week_name : w.week_name,
        overview: typeof data.overview === "string" ? data.overview : w.overview,
        resources: Array.isArray(data.resources) ? data.resources.map((r: any) => ({
          id: makeId(),
          type: r.type === "article" ? "article" : "coding-exercise",
          title: r.title || "Untitled",
          description: r.description || "",
          url: r.url || undefined,
          ai_suggested: true,
        })) : w.resources,
      })));
      toast({ title: "Week regenerated", description: `Week ${target.week} content refreshed.` });
    } catch (err: any) {
      console.error("Regenerate week failed:", err);
      toast({
        title: "Could not regenerate week",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingWeekId(null);
    }
  }, [courseId, weeks, toast]);

  // Schedule completeness + change detection
  const scheduleComplete = !!(totalWeeks && midtermWeek && finalWeek);
  const scheduleChanged = !lastGeneratedSchedule
    || lastGeneratedSchedule.total_weeks !== totalWeeks
    || lastGeneratedSchedule.midterm_week !== midtermWeek
    || lastGeneratedSchedule.final_week !== finalWeek;

  // ─── Week handlers ───
  const toggleWeek = (id: string) =>
    setExpandedWeeks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleLock = (id: string) => {
    const w = weeks.find(x => x.id === id);
    if (!w) return;
    const newLocked = !w.locked;
    setWeeks(prev => prev.map(x => x.id === id ? { ...x, locked: newLocked } : x));
    toast({
      title: newLocked ? "Hidden from students" : "Now visible to students",
      description: `Week ${w.week} ${newLocked ? "is now hidden" : "is now visible"}.`,
    });
    // Persist immediately so student visibility flips without a republish.
    if (courseId) {
      setWeekLocked(courseId, w.week, newLocked).catch((err) => {
        console.warn("Failed to persist week lock:", err);
      });
    }
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
    setPublishConfirmed(false);
    if (user && courseId) {
      try {
        const payload = { weeks, overall_course_learning_outcomes: overallOutcomes };
        const planJson = JSON.stringify(payload, null, 2);
        const blob = new Blob([planJson], { type: "application/json" });
        const file = new File([blob], "published-plan.json", { type: "application/json" });
        const publishedPath = canonicalPublishedPath(courseId);
        const { error: uploadError } = await supabase.storage
          .from(LESSON_PLAN_BUCKET)
          .upload(publishedPath, file, { upsert: true, cacheControl: "0" });
        if (uploadError) throw uploadError;
        // Verify the upload is actually retrievable before recording the publish.
        const verify = await supabase.storage.from(LESSON_PLAN_BUCKET).download(publishedPath);
        if (!verify.data) throw new Error("Publish verification failed: file is not retrievable.");
        JSON.parse(await verify.data.text());
        // Record path + publish timestamp on the course row (best-effort).
        await recordPublishedPath(courseId, publishedPath);
        // Source of truth for student visibility: per-week rows in DB
        // (RLS hides locked + future weeks from students automatically).
        await upsertPublishedWeeks(
          courseId,
          weeks.map((w) => ({
            week_number: w.week,
            week_name: w.week_name,
            overview: w.overview,
            is_exam_week: w.is_exam_week,
            locked: w.locked,
            concepts: w.concepts,
            resources: w.resources,
          })),
          overallOutcomes,
        );
      } catch (err: any) {
        console.error("Failed to save published plan:", err);
        toast({
          title: "Publish failed",
          description: err?.message || "We couldn't confirm the lesson plan was saved. Please try publishing again.",
          variant: "destructive",
        });
        return;
      }
    }
    toast({ title: "Lesson plan published", description: embedded ? "Changes are now live for students and the AI Teaching Assistant." : "You can keep editing future weeks anytime — just re-publish to push updates." });
    if (!embedded) navigate("/teacher/setup/diagnostic");
  };

  // ─── Generation phase UI ───
  const genSteps = [
    { label: "Estimating concept effort", desc: "AI gauges complexity and time-to-mastery for each concept" },
    { label: "Distributing across weeks", desc: "Balancing weeks by teacher weight and estimated effort" },
    { label: "Authoring week details", desc: "Writing titles, overviews, and resources per week" },
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

  // ─── IDLE PHASE: schedule form + Generate button (no plan yet) ───
  if (phase === "idle") {
    return (
      <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
        <div className="w-full max-w-[640px] space-y-5">
          {!embedded && (
            <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Course Setup
            </Button>
          )}
          <div className="text-center space-y-2">
            <h1 className="font-heading text-2xl font-bold">
              AI <span className="text-primary">Lesson Plan</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Set your course schedule below, then click Generate Lesson Plan. We'll distribute your approved concepts across teaching weeks in learning order.
            </p>
          </div>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Course Schedule</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Total Weeks <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={4}
                  max={24}
                  value={totalWeeks ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v) && v >= 4 && v <= 24) {
                      setTotalWeeks(v);
                      const patch: any = { total_weeks: v };
                      if (midtermWeek && midtermWeek > v) { setMidtermWeek(null); patch.midterm_week = null; }
                      if (finalWeek && finalWeek > v) { setFinalWeek(null); patch.final_week = null; }
                      persistSchedule(patch);
                    } else if (e.target.value === "") {
                      setTotalWeeks(null);
                    }
                  }}
                  placeholder="e.g. 16"
                  className="mt-1 h-9"
                />
                <p className="text-[11px] text-muted-foreground mt-1">4–24 weeks</p>
              </div>
              <div>
                <Label className="text-xs">Midterm Week <span className="text-destructive">*</span></Label>
                <Select
                  value={midtermWeek ? String(midtermWeek) : ""}
                  onValueChange={(v) => {
                    const next = parseInt(v, 10);
                    setMidtermWeek(next);
                    persistSchedule({ midterm_week: next });
                  }}
                  disabled={!totalWeeks}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select week" /></SelectTrigger>
                  <SelectContent>
                    {totalWeeks && Array.from({ length: totalWeeks }, (_, i) => i + 1)
                      .filter(n => n !== finalWeek)
                      .map(n => (
                        <SelectItem key={n} value={String(n)}>Week {n}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Final Week <span className="text-destructive">*</span></Label>
                <Select
                  value={finalWeek ? String(finalWeek) : ""}
                  onValueChange={(v) => {
                    const next = parseInt(v, 10);
                    setFinalWeek(next);
                    persistSchedule({ final_week: next });
                  }}
                  disabled={!totalWeeks}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select week" /></SelectTrigger>
                  <SelectContent>
                    {totalWeeks && Array.from({ length: totalWeeks }, (_, i) => i + 1)
                      .filter(n => n !== midtermWeek)
                      .map(n => (
                        <SelectItem key={n} value={String(n)}>Week {n}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!scheduleComplete || !courseId}
              onClick={runGeneration}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Lesson Plan
            </Button>
            {!scheduleComplete && (
              <p className="text-[11px] text-muted-foreground text-center">
                Fill in Total Weeks, Midterm Week, and Final Week to enable generation.
              </p>
            )}
          </Card>
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
            <p className="text-sm text-muted-foreground mt-2">Usually takes 60–150 seconds.</p>
          </div>
          {(() => {
            const eta = 90;
            const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
            const pct = genError
              ? Math.min(92, (genElapsed / eta) * 90)
              : genStep >= 2
              ? 100
              : Math.min(92, (genElapsed / eta) * 90);
            const over = genElapsed > eta;
            return (
              <div className="space-y-2">
                <Progress value={pct} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {genError
                    ? `Stopped at ${fmt(genElapsed)}`
                    : over
                    ? `Taking longer than usual… (${fmt(genElapsed)})`
                    : `Elapsed ${fmt(genElapsed)} · Est. ~${eta}s`}
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  Using teacher-set weights and AI-estimated complexity to balance the schedule.
                </p>
              </div>
            );
          })()}
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
              <p className="text-sm font-medium text-destructive">
                {noConceptsError ? "No approved concepts found" : "Generation failed"}
              </p>
              <p className="text-xs text-muted-foreground">{genError}</p>
              <div className="flex justify-center gap-2 flex-wrap">
                {noConceptsError ? (
                  <Button size="sm" onClick={() => navigate("/teacher/setup/concept-review")}>
                    Go to Concept Review <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={runGeneration}>Retry</Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/teacher/setup/upload")}>Back to materials</Button>
                  </>
                )}
              </div>
            </div>
          )}
          {!genError && genElapsed > 150 && (
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

  return (
    <div className={embedded ? "w-full" : "flex min-h-screen items-start justify-center bg-background px-4 py-8"}>
      <div className={embedded ? "w-full space-y-6" : "w-full max-w-4xl space-y-6"}>
        {/* Top-left return navigation (replaces SetupProgressBar) */}
        {!embedded && (
          <div>
            <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Course Setup
            </Button>
          </div>
        )}
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

        {/* Course Schedule — Total Weeks / Midterm / Final */}
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setScheduleExpanded(s => !s)}
            className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Course Schedule</p>
              {totalWeeks && (
                <span className="text-xs text-muted-foreground">
                  · {totalWeeks} weeks
                  {midtermWeek ? ` · Midterm Wk ${midtermWeek}` : ""}
                  {finalWeek ? ` · Final Wk ${finalWeek}` : ""}
                </span>
              )}
            </div>
            {scheduleExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {scheduleExpanded && (
            <div className="border-t px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Total Weeks</Label>
                <Input
                  type="number"
                  min={4}
                  max={24}
                  value={totalWeeks ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v) && v >= 4 && v <= 24) {
                      setTotalWeeks(v);
                      // If midterm/final exceed new total, clear them
                      const patch: any = { total_weeks: v };
                      if (midtermWeek && midtermWeek > v) { setMidtermWeek(null); patch.midterm_week = null; }
                      if (finalWeek && finalWeek > v) { setFinalWeek(null); patch.final_week = null; }
                      persistSchedule(patch);
                    } else if (e.target.value === "") {
                      setTotalWeeks(null);
                    }
                  }}
                  className="mt-1 h-9"
                />
                <p className="text-[11px] text-muted-foreground mt-1">4–24 weeks</p>
              </div>
              <div>
                <Label className="text-xs">Midterm Week</Label>
                <Select
                  value={midtermWeek ? String(midtermWeek) : "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? null : parseInt(v, 10);
                    setMidtermWeek(next);
                    persistSchedule({ midterm_week: next });
                  }}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {totalWeeks && Array.from({ length: totalWeeks }, (_, i) => i + 1)
                      .filter(n => n !== finalWeek)
                      .map(n => (
                        <SelectItem key={n} value={String(n)}>Week {n}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Final Week</Label>
                <Select
                  value={finalWeek ? String(finalWeek) : "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? null : parseInt(v, 10);
                    setFinalWeek(next);
                    persistSchedule({ final_week: next });
                  }}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {totalWeeks && Array.from({ length: totalWeeks }, (_, i) => i + 1)
                      .filter(n => n !== midtermWeek)
                      .map(n => (
                        <SelectItem key={n} value={String(n)}>Week {n}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRegenerateConfirm(true)}
                  disabled={!scheduleComplete || !scheduleChanged}
                  title={!scheduleChanged ? "Schedule hasn't changed since last generation" : undefined}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Update Plan
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Notice: concepts come from approved list */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
          Concepts shown below come from your approved concept list and have been arranged in teaching order based on estimated learning duration.
        </div>

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRegenFromScratchConfirm(true)}
              disabled={!courseId}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate Plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRegenerateConfirm(true)}
              disabled={!scheduleComplete || !scheduleChanged}
              title={!scheduleChanged ? "Update the Course Schedule above to enable" : undefined}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Update Plan
            </Button>
          </div>
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
                            disabled={regeneratingWeekId === w.id || w.is_exam_week}
                            onClick={(e) => { e.stopPropagation(); setConfirmRegenWeekId(w.id); }}
                            className="h-7 px-2 text-xs gap-1"
                            title={w.is_exam_week ? "Exam week — nothing to regenerate" : "Regenerate this week's title, overview & resources"}
                          >
                            {regeneratingWeekId === w.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            <span className="hidden sm:inline">Regenerate</span>
                          </Button>
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
                                                <SelectItem value="coding-exercise">Industry Exercise</SelectItem>
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
                                              {r.type === "coding-exercise" ? "Industry Exercise" : "Article"}
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
          {embedded ? (
            <div />
          ) : (
            <Button variant="outline" onClick={() => navigate("/teacher/setup/materials")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Materials
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant={published ? "outline" : "default"}
              onClick={() => setShowPublishModal(true)}
              disabled={weeks.length === 0}
            >
              {published ? "Re-publish Plan" : "Publish Plan"}
            </Button>
            {!embedded && (
              <Button
                onClick={() => navigate("/teacher/setup/diagnostic")}
                disabled={weeks.length === 0 || !published}
                title={!published ? "Publish the lesson plan first to continue" : undefined}
              >
                Continue to Diagnostic <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {!embedded && !published && weeks.length > 0 && (
          <p className="text-xs text-muted-foreground text-right -mt-3">
            Publish the lesson plan to unlock the Diagnostic step. You can still edit weeks afterward.
          </p>
        )}
      </div>

      {/* Publish modal */}
      <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish lesson plan?</DialogTitle>
            <DialogDescription>
              Publishing makes this plan live for your AI Teaching Assistant and unlocks the Diagnostic step. Students only see weeks you've marked <span className="inline-flex items-center gap-1 font-medium"><Eye className="h-3 w-3" /> Visible</span>. You can keep editing any week anytime from Course Setup or the Content Library — just re-publish to push updates.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={publishConfirmed}
                onCheckedChange={(v) => setPublishConfirmed(!!v)}
                className="mt-0.5"
              />
              <span className="text-sm">
                I'm ready to publish this lesson plan and continue to the Diagnostic setup step. I understand I can keep editing future weeks afterward.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPublishModal(false)}>Cancel</Button>
            <Button onClick={handlePublish} disabled={!publishConfirmed}>Publish & Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Plan confirm */}
      <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update lesson plan?</DialogTitle>
            <DialogDescription>
              This will replace your current weeks and any edits with a fresh distribution based on the updated schedule and your approved concepts. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRegenerateConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setShowRegenerateConfirm(false);
                setWeeksRaw([]);
                setExpandedWeeks([]);
                localStorage.removeItem(draftLocalKey);
                runGeneration();
              }}
            >
              Update Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRegenFromScratchConfirm} onOpenChange={setShowRegenFromScratchConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate lesson plan?</DialogTitle>
            <DialogDescription>
              This will discard the current weeks and any edits and produce a fresh AI-generated plan from your approved concepts. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRegenFromScratchConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setShowRegenFromScratchConfirm(false);
                setWeeksRaw([]);
                setExpandedWeeks([]);
                localStorage.removeItem(draftLocalKey);
                runGeneration();
              }}
            >
              Regenerate Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRegenWeekId} onOpenChange={(o) => !o && setConfirmRegenWeekId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate this week?</DialogTitle>
            <DialogDescription>
              Only the week's <strong>title</strong>, <strong>overview</strong>, and <strong>resources</strong> will be replaced with a fresh AI draft. The assigned <strong>concepts stay locked</strong> and won't change. Any manual edits to title, overview, or resources for this week will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRegenWeekId(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const id = confirmRegenWeekId;
                setConfirmRegenWeekId(null);
                if (id) regenerateWeek(id);
              }}
            >
              Regenerate Week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourseCreation;
