import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTASettings } from "@/hooks/useTASettings";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { markStepCompleted } from "@/lib/setupProgress";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, Calculator, Check, Pencil, Info, AlertTriangle, ArrowLeft,
  Plus, Trash2, Filter, ClipboardCheck, Loader2, Shield, Sparkles,
} from "lucide-react";
import SetupModuleNav from "@/components/SetupModuleNav";
import QuestionTypeSelector from "@/components/QuestionTypeSelector";
import ExamQuestionsViewDialog from "@/components/ExamQuestionsViewDialog";
import { bumpCacheVersion } from "@/lib/cacheVersion";
import type { ExamScheduleItem } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCourseExams, nextAvailableLabel } from "@/hooks/useCourseExams";
import { Archive, RotateCcw } from "lucide-react";


const newExamId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `exam-${Math.random().toString(36).slice(2)}-${Date.now()}`;

type QuestionType = "MCQ" | "True/False" | "Short Answer" | "Code Practice";

interface EditableQuestion {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  type: QuestionType;
  options?: string[];
  correctIndex?: number;
  exam_id?: string | null;
  bloom_level?: number | null;
  explanation?: string | null;
  difficulty_estimate?: number | null;
  bloom_justification?: string | null;
  difficulty_justification?: string | null;
}

// Map internal type keys to display labels
const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  true_false: "True/False",
  short_answer: "Short Answer",
  problem_solving: "Coding",
};

// Allowed question types on this page
const ALLOWED_EXAM_TYPES = ["mcq", "true_false"];

// Parse the mix value (supports legacy presets + new comma-separated keys)
const parseMix = (mix: string): string[] => {
  if (!mix || mix === "mixed") return [...ALLOWED_EXAM_TYPES];
  const legacy: Record<string, string[]> = {
    mcq_only: ["mcq"],
    true_false_only: ["true_false"],
    short_answer: [],
    problem_solving: [],
    mcq_short: ["mcq"],
    mcq_problem: ["mcq"],
  };
  if (legacy[mix]) return legacy[mix];
  return mix.split(",").map(k => k.trim()).filter(k => ALLOWED_EXAM_TYPES.includes(k));
};

const questionEstimate = (length: number, mix: string) => {
  const total = Math.max(5, Math.round(length / 3));
  const types = parseMix(mix);
  const breakdown: Record<string, number> = {};

  if (types.length === 0) return { total, breakdown };

  // Distribute evenly across selected types, remainder goes to first type
  const base = Math.floor(total / types.length);
  const remainder = total - base * types.length;
  types.forEach((key, idx) => {
    const label = TYPE_LABELS[key] ?? key;
    breakdown[label] = base + (idx < remainder ? 1 : 0);
  });

  return { total, breakdown };
};

const ExamMode = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const { taSettings, loading, saveTASettings } = useTASettings(courseId);
  const {
    active: activeCourseExams,
    archived: archivedCourseExams,
    loading: examsLoading,
    upsertExam,
    archiveExam,
    restoreExam,
    deleteExamRow,
    publishExam,
    unpublishExam,
  } = useCourseExams(courseId);


  // ── Exam config state ──
  const [settings, setSettings] = useState(taSettings);
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix || "mixed");
  const [examEnabled, setExamEnabled] = useState(taSettings.examEnabled ?? false);

  // Multi-exam schedule. Source of truth is the course_exams table (active rows
  // only). We hydrate local state from there; the JSON examSchedule on
  // course_ta_settings is kept in sync on save for backward compat with older
  // student code paths.
  const buildInitialSchedule = (): ExamScheduleItem[] => {
    if (activeCourseExams.length > 0) {
      return activeCourseExams.map(e => {
        // Treat the DB breakdown as "dirty" if it doesn't match the time-based
        // estimate for this length+mix — preserves teacher overrides through reloads.
        const expected = questionEstimate(e.length_min, taSettings.examQuestionMix || "mixed").breakdown;
        const sameKeys = Object.keys(expected).length === Object.keys(e.breakdown ?? {}).length
          && Object.entries(expected).every(([k, v]) => (e.breakdown as Record<string, number>)?.[k] === v);
        return {
          id: e.id,
          kind: e.kind,
          lengthMin: e.length_min,
          breakdown: e.breakdown,
          approved: e.approved,
          source: e.source,
          publishedAt: e.published_at,
          breakdownDirty: !sameKeys,
        };
      });

    }
    if (taSettings.examSchedule && taSettings.examSchedule.length > 0) {
      return taSettings.examSchedule.map(e => ({ ...e, source: e.source ?? "generated" }));
    }
    const legacyLength = taSettings.examTimeLimit ?? 60;
    const legacyMix = taSettings.examQuestionMix || "mixed";
    return [{
      id: newExamId(),
      kind: "final",
      lengthMin: legacyLength,
      breakdown: questionEstimate(legacyLength, legacyMix).breakdown,
      approved: taSettings.examApproved ?? false,
      source: "generated",
    }];
  };

  const [examSchedule, setExamSchedule] = useState<ExamScheduleItem[]>(buildInitialSchedule);
  // Tracks which cards are in "Edit Breakdown" mode (id → true)
  const [editingCardIds, setEditingCardIds] = useState<Record<string, boolean>>({});
  // Pending removal confirmation (when popping an approved card)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmArchiveExamId, setConfirmArchiveExamId] = useState<string | null>(null);
  const [archivingExam, setArchivingExam] = useState(false);
  const [restoringExamId, setRestoringExamId] = useState<string | null>(null);

  // ── Custom exam questions state (merged from Assessments) ──
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formType, setFormType] = useState<QuestionType>("MCQ");
  const [formOptions, setFormOptions] = useState<string[]>(["", "", "", ""]);
  const [formCorrectIndex, setFormCorrectIndex] = useState<number>(0);
  const [formExamId, setFormExamId] = useState<string | null>(null);
  const [formDifficulty, setFormDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [formBloom, setFormBloom] = useState<number>(2);
  const [formExplanation, setFormExplanation] = useState<string>("");
  const [formDifficultyEstimate, setFormDifficultyEstimate] = useState<string>("0.50");
  const [formBloomJustification, setFormBloomJustification] = useState<string>("");
  const [formDifficultyJustification, setFormDifficultyJustification] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [concepts, setConcepts] = useState<{ id: string; concept_code: string }[]>([]);

  // Per-exam generated-question state
  const [examQuestionCounts, setExamQuestionCounts] = useState<Record<string, number>>({});
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [viewExamId, setViewExamId] = useState<string | null>(null);




  useEffect(() => {
    if (!loading && !examsLoading) {
      setSettings(taSettings);
      setExamQuestionTypes(taSettings.examQuestionMix || "mixed");
      setExamEnabled(taSettings.examEnabled ?? false);
      setExamSchedule(buildInitialSchedule());
      // Prune editing flags for exams that no longer exist; preserve flags for live ids
      // so an in-progress "Edit Breakdown" survives the reload triggered by upsertExam.
      setEditingCardIds(prev => {
        const liveIds = new Set(activeCourseExams.map(e => e.id));
        const next: Record<string, boolean> = {};
        for (const [id, v] of Object.entries(prev)) if (liveIds.has(id)) next[id] = v;
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, examsLoading, taSettings, activeCourseExams]);


  const refetchConcepts = async () => {
    if (!courseId) return;
    const { data, error } = await supabase
      .from("concepts")
      .select("id, concept_code")
      .eq("course_id", courseId)
      .order("concept_code");
    if (error) {
      console.error("Failed to load concepts:", error);
      toast.error("Failed to load concepts");
      return;
    }
    setConcepts((data as any[]) || []);
  };

  useEffect(() => {
    if (!courseId) return;
    refetchConcepts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Self-heal: if taSettings.examSchedule (legacy JSON) contains ids that are
  // not present in active course_exams (e.g. archived after a past save),
  // prune them and write the cleaned list back so the JSON cannot leak
  // archived exams to older code paths.
  const examScheduleSelfHealRan = useRef(false);
  useEffect(() => {
    if (examScheduleSelfHealRan.current) return;
    if (loading || examsLoading) return;
    const stored = taSettings.examSchedule;
    if (!Array.isArray(stored) || stored.length === 0) return;
    const activeIdSet = new Set(activeCourseExams.map(e => e.id));
    const cleaned = stored.filter((e: any) => e?.id && activeIdSet.has(e.id));
    if (cleaned.length !== stored.length) {
      examScheduleSelfHealRan.current = true;
      void saveTASettings({ ...taSettings, examSchedule: cleaned });
    } else {
      examScheduleSelfHealRan.current = true;
    }
  }, [loading, examsLoading, activeCourseExams, taSettings, saveTASettings]);


  useEffect(() => {
    if (!courseId) { setQuestionsLoading(false); return; }
    const fetchQuestions = async () => {
      setQuestionsLoading(true);
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("*")
        .eq("course_id", courseId)
        .eq("mode", "exam");
      if (error) { console.error(error); toast.error("Failed to load custom exam questions"); }
      else if (data) {
        // Manual rows = anything NOT created by the AI generator (which sets item_code = "exam-...").
        // Manual rows may have exam_id set (assigned to a specific exam) or null (library only).
        const manual = (data as any[]).filter((row) => !(typeof row.item_code === "string" && row.item_code.startsWith("exam-")));
        setQuestions(manual.map((row: any) => ({
          id: row.id, question: row.question_text, answer: row.answer, topic: row.topic,
          difficulty: row.difficulty, type: row.question_type,
          options: row.options, correctIndex: row.correct_index ?? undefined,
          exam_id: row.exam_id ?? null,
          bloom_level: row.bloom_level ?? null,
          explanation: row.explanation ?? null,
          difficulty_estimate: row.difficulty_estimate != null ? Number(row.difficulty_estimate) : null,
          bloom_justification: row.bloom_justification ?? null,
          difficulty_justification: row.difficulty_justification ?? null,
        })));
        const counts: Record<string, number> = {};
        for (const row of data as any[]) {
          if (row.exam_id) counts[row.exam_id] = (counts[row.exam_id] ?? 0) + 1;
        }
        setExamQuestionCounts(counts);
      }
      setQuestionsLoading(false);
    };
    fetchQuestions();
  }, [courseId]);

  const refreshExamCounts = async () => {
    if (!courseId) return;
    const { data } = await supabase
      .from("assessment_questions")
      .select("exam_id, item_code")
      .eq("course_id", courseId)
      .eq("mode", "exam");
    const counts: Record<string, number> = {};
    for (const row of (data as any[]) ?? []) {
      if (row.exam_id) counts[row.exam_id] = (counts[row.exam_id] ?? 0) + 1;
    }
    setExamQuestionCounts(counts);
  };




  // ── Schedule mutation helpers ──
  // Persist to course_exams whenever we mutate a card. The label is derived
  // from active position ("Final N"); collisions can only occur on restore,
  // and useCourseExams.restoreExam handles auto-rename in that case.
  // Keep a ref to the latest examSchedule so debounced/timeout-based persists
  // always read fresh state, not the closure value from when they were scheduled.
  const scheduleRef = useRef<ExamScheduleItem[]>([]);
  scheduleRef.current = examSchedule;

  const persistExam = (id: string, patch: Partial<ExamScheduleItem>) => {
    const schedule = scheduleRef.current;
    const idx = schedule.findIndex(e => e.id === id);
    if (idx < 0) return;
    const next = { ...schedule[idx], ...patch };
    // Any mutation that removes approval also removes publication — students
    // should never see an exam mid-edit.
    const publishFields = !next.approved
      ? { published_at: null, published_by: null }
      : {};
    void upsertExam({
      id,
      label: `Final ${idx + 1}`,
      kind: next.kind,
      length_min: next.lengthMin,
      breakdown: next.breakdown as Record<string, number>,
      source: next.source ?? "generated",
      approved: next.approved,
      position: idx,
      ...publishFields,
    }).catch(e => console.error("persist exam failed:", e));
  };

  // Per-id debounce timers for breakdown edits — avoids reloading activeCourseExams
  // (and re-hydrating examSchedule) on every keystroke, which would steal focus
  // from the number input.
  const persistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => () => {
    persistTimersRef.current.forEach(t => clearTimeout(t));
    persistTimersRef.current.clear();
  }, []);
  const persistExamDebounced = (id: string, delay = 400) => {
    const timers = persistTimersRef.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      timers.delete(id);
      persistExam(id, {});
    }, delay);
    timers.set(id, handle);
  };

  const updateExam = (id: string, patch: Partial<ExamScheduleItem>) => {
    // Auto-clear local publish flag if this edit unapproves the card.
    const localPatch: Partial<ExamScheduleItem> =
      patch.approved === false ? { ...patch, publishedAt: null } : patch;
    setExamSchedule(prev => prev.map(e => e.id === id ? { ...e, ...localPatch } : e));
    persistExam(id, patch);
  };





  // When the global question types change, refresh each card's breakdown
  // (preserve approved state only if the type set is unchanged for that card)
  useEffect(() => {
    setExamSchedule(prev => {
      const next = prev.map(e => {
        // Preserve manual cards and any card whose breakdown the teacher has overridden.
        if (e.source === "manual" || e.breakdownDirty) return e;
        return {
          ...e,
          breakdown: questionEstimate(e.lengthMin, examQuestionTypes).breakdown,
          approved: false,
          publishedAt: null,
        };
      });
      next.forEach((e, idx) => {
        if (e.source !== "manual" && !e.breakdownDirty) {
          void upsertExam({
            id: e.id,
            breakdown: e.breakdown as Record<string, number>,
            approved: false,
            published_at: null,
            published_by: null,
            position: idx,
          }).catch(err => console.error("persist breakdown refresh failed:", err));
        }
      });

      return next;
    });
    setEditingCardIds({});

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examQuestionTypes]);

  const handleExamTypeChange = (v: string) => setExamQuestionTypes(v);

  const [addingExam, setAddingExam] = useState(false);
  const handleAddExam = async () => {
    if (addingExam) return;
    
    if (!courseId) return;
    setAddingExam(true);
    const lengthMin = 60;
    const breakdown = questionEstimate(lengthMin, examQuestionTypes).breakdown as Record<string, number>;

    const attemptInsert = async (activeLabels: string[], activePositions: number[]) => {
      const id = newExamId();
      const label = nextAvailableLabel(activeLabels);
      const position = activePositions.length > 0 ? Math.max(...activePositions) + 1 : 0;
      await upsertExam({
        id,
        label,
        kind: "final",
        length_min: lengthMin,
        breakdown,
        source: "generated",
        approved: false,
        position,
      });
    };

    try {
      const labels = activeCourseExams.map(e => e.label);
      const positions = activeCourseExams.map(e => e.position);
      try {
        await attemptInsert(labels, positions);
      } catch (e: any) {
        if (e?.code === "23505") {
          // Stale cache collided with DB. Reload and retry once with fresh labels.
          const { data } = await supabase
            .from("course_exams" as never)
            .select("label, position, archived_at")
            .eq("course_id", courseId);
          const freshActive = ((data as any[]) ?? []).filter(r => !r.archived_at);
          await attemptInsert(
            freshActive.map(r => r.label as string),
            freshActive.map(r => (r.position as number) ?? 0),
          );
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      console.error("add exam failed:", e);
      toast.error("Couldn't add mock test. Please try again.");
    } finally {
      setAddingExam(false);
    }
  };


  const handleSourceChange = (id: string, source: "generated" | "manual") => {
    updateExam(id, { source, approved: false });
  };

  /** Delete AI-generated questions for an exam and unassign manual ones. Safe
   *  to call even when the exam has no questions yet. */
  const cleanupExamQuestions = async (examId: string) => {
    if (!courseId) return;
    const { data: existing, error: selErr } = await supabase
      .from("assessment_questions")
      .select("id, item_code")
      .eq("course_id", courseId)
      .eq("mode", "exam")
      .eq("exam_id", examId);
    if (selErr) throw selErr;
    const generatedIds = ((existing as any[]) ?? [])
      .filter(r => typeof r.item_code === "string" && r.item_code.startsWith("exam-"))
      .map(r => r.id);
    if (generatedIds.length > 0) {
      const { error: delErr } = await supabase
        .from("assessment_questions").delete().in("id", generatedIds);
      if (delErr) throw delErr;
    }
    const { error: updErr } = await supabase
      .from("assessment_questions")
      .update({ exam_id: null })
      .eq("course_id", courseId)
      .eq("mode", "exam")
      .eq("exam_id", examId);
    if (updErr) throw updErr;
    bumpCacheVersion("questions", courseId);
  };

  const handleRemoveExamRequest = () => {
    if (examSchedule.length === 0) return;
    const last = examSchedule[examSchedule.length - 1];
    const hasQuestions = (examQuestionCounts[last.id] ?? 0) > 0;
    if (last.approved || hasQuestions) {
      setConfirmRemoveId(last.id);
    } else {
      // Unapproved and empty — archive immediately (preserves nothing of value,
      // but keeps the row in case the teacher restores).
      const id = last.id;
      setExamSchedule(prev => prev.slice(0, -1));
      archiveExam(id, user?.id ?? null).catch(e => console.error("archive failed:", e));
    }
  };
  const confirmRemoveExam = async () => {
    const id = confirmRemoveId;
    if (!id) { setConfirmRemoveId(null); return; }
    try {
      await archiveExam(id, user?.id ?? null);
      setExamSchedule(prev => prev.filter(e => e.id !== id));
      setEditingCardIds(prev => { const { [id]: _, ...rest } = prev; return rest; });
    } catch (e: any) {
      console.error("remove exam failed:", e);
      toast.error(e?.message ?? "Failed to remove exam");
    } finally {
      setConfirmRemoveId(null);
    }
  };

  const requestArchiveExam = (id: string) => {
    setConfirmArchiveExamId(id);
  };

  const executeArchiveExam = async () => {
    const id = confirmArchiveExamId;
    if (!id || !courseId) return;
    setArchivingExam(true);
    try {
      // Soft-delete: archive the exam row. Do NOT touch questions or student
      // submissions — they're preserved for analytics and restore.
      await archiveExam(id, user?.id ?? null);
      setExamSchedule(prev => prev.filter(e => e.id !== id));
      setEditingCardIds(prev => { const { [id]: _, ...rest } = prev; return rest; });
      toast.success("Mock test archived. Questions and submissions kept.");
    } catch (e: any) {
      console.error("archive exam failed:", e);
      toast.error(e?.message ?? "Failed to archive mock test");
    } finally {
      setArchivingExam(false);
      setConfirmArchiveExamId(null);
    }
  };

  const handleRestoreExam = async (id: string) => {
    setRestoringExamId(id);
    try {
      const { renamedTo } = await restoreExam(id);
      const restored = archivedCourseExams.find(e => e.id === id);
      if (restored) {
        setExamSchedule(prev => [...prev, {
          id: restored.id,
          kind: restored.kind,
          lengthMin: restored.length_min,
          breakdown: restored.breakdown,
          approved: false, // require re-approval after restore
          source: restored.source,
        }]);
      }
      if (renamedTo) {
        toast.success(`Restored — renamed to "${renamedTo}" to avoid conflict.`);
      } else {
        toast.success("Mock test restored");
      }
    } catch (e: any) {
      console.error("restore exam failed:", e);
      toast.error(e?.message ?? "Failed to restore mock test");
    } finally {
      setRestoringExamId(null);
    }
  };

  // ── Permanent delete of an archived exam ──
  const [deleteExamTarget, setDeleteExamTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteSubmissionCount, setDeleteSubmissionCount] = useState<number | null>(null);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);

  const openDeleteArchivedExam = async (id: string, label: string) => {
    setDeleteExamTarget({ id, label });
    setDeleteSubmissionCount(null);
    try {
      const { count } = await supabase
        .from("assessment_results")
        .select("id", { count: "exact", head: true })
        .eq("exam_id", id);
      setDeleteSubmissionCount(count ?? 0);
    } catch (e) {
      console.error("failed to count submissions:", e);
      setDeleteSubmissionCount(0);
    }
  };

  const confirmDeleteArchivedExam = async () => {
    if (!deleteExamTarget) return;
    const id = deleteExamTarget.id;
    setDeletingExamId(id);
    try {
      const { error: qErr } = await supabase
        .from("assessment_questions")
        .delete()
        .eq("exam_id", id);
      if (qErr) throw qErr;
      await deleteExamRow(id);
      toast.success("Archived exam permanently deleted. Past student submissions were preserved.");
      setDeleteExamTarget(null);
    } catch (e: any) {
      console.error("delete archived exam failed:", e);
      toast.error(e?.message ?? "Failed to delete exam");
    } finally {
      setDeletingExamId(null);
    }
  };

  const handleLengthChange = (id: string, v: number) => {
    const exam = examSchedule.find(e => e.id === id);
    if (!exam) return;
    // Only recompute the breakdown if the teacher hasn't manually overridden it.
    const patch: Partial<ExamScheduleItem> = exam.breakdownDirty
      ? { lengthMin: v, approved: false }
      : { lengthMin: v, breakdown: questionEstimate(v, examQuestionTypes).breakdown, approved: false };
    updateExam(id, patch);
  };

  const handleKindChange = (id: string, kind: "midterm" | "final") => {
    updateExam(id, { kind, approved: false });
  };

  const handleBreakdownNumberChange = (id: string, type: string, value: number) => {
    const exam = examSchedule.find(e => e.id === id);
    if (!exam) return;
    const nextBreakdown = { ...exam.breakdown, [type]: Math.max(0, value || 0) };
    setExamSchedule(prev => prev.map(e =>
      e.id === id ? { ...e, breakdown: nextBreakdown, approved: false, publishedAt: null, breakdownDirty: true } : e
    ));
    persistExamDebounced(id);
  };

  const handleResetBreakdown = (id: string) => {
    const exam = examSchedule.find(e => e.id === id);
    if (!exam) return;
    const fresh = questionEstimate(exam.lengthMin, examQuestionTypes).breakdown;
    setExamSchedule(prev => prev.map(e =>
      e.id === id ? { ...e, breakdown: fresh, breakdownDirty: false, approved: false, publishedAt: null } : e
    ));
    persistExamDebounced(id);
  };





  const handleApproveExam = (id: string) => {
    setEditingCardIds(prev => ({ ...prev, [id]: false }));
    updateExam(id, { approved: !examSchedule.find(e => e.id === id)?.approved });
  };

  const [publishingExamId, setPublishingExamId] = useState<string | null>(null);
  const handleTogglePublish = async (id: string) => {
    const exam = examSchedule.find(e => e.id === id);
    if (!exam) return;
    if (!exam.approved) {
      toast.error("Approve this mock test before publishing to students.");
      return;
    }
    const generatedCount = examQuestionCounts[id] ?? 0;
    const manualCount = manualExamCounts[id] ?? 0;
    const hasQuestions = exam.source === "manual" ? manualCount > 0 : generatedCount > 0;
    if (!exam.publishedAt && !hasQuestions) {
      toast.error(exam.source === "manual"
        ? "Add at least one manual question before publishing."
        : "Generate questions before publishing.");
      return;
    }
    setPublishingExamId(id);
    try {
      if (exam.publishedAt) {
        await unpublishExam(id);
        setExamSchedule(prev => prev.map(e => e.id === id ? { ...e, publishedAt: null } : e));
        toast.success(`${`Final ${examSchedule.findIndex(e => e.id === id) + 1}`} unpublished — students can no longer see it.`);
      } else {
        await publishExam(id, user?.id ?? null);
        const nowIso = new Date().toISOString();
        setExamSchedule(prev => prev.map(e => e.id === id ? { ...e, publishedAt: nowIso } : e));
        toast.success(`${`Final ${examSchedule.findIndex(e => e.id === id) + 1}`} is now visible to students.`);
      }
    } catch (e) {
      console.error("toggle publish failed:", e);
      toast.error("Couldn't update publish state. Please try again.");
    } finally {
      setPublishingExamId(null);
    }
  };


  // Auto-label each card "Final N"
  const labeledSchedule = useMemo(() => {
    let n = 0;
    return examSchedule.map(e => {
      n += 1;
      return { ...e, label: `Final ${n}`, source: e.source ?? "generated" };
    });
  }, [examSchedule]);

  // Count manual questions assigned to each exam
  const manualExamCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      if (q.exam_id) counts[q.exam_id] = (counts[q.exam_id] ?? 0) + 1;
    }
    return counts;
  }, [questions]);

  const manualExams = labeledSchedule.filter(e => e.source === "manual");

  const typesSelected = parseMix(examQuestionTypes).length > 0;
  const allExamsApproved = examSchedule.length > 0 && examSchedule.every(e => e.approved);
  const canContinue = allExamsApproved && typesSelected;

  // ── Generate Questions handler ──
  const handleGenerateQuestions = async (examId: string) => {
    if (!courseId) { toast.error("No course selected"); return; }
    const exam = examSchedule.find(e => e.id === examId);
    if (!exam) return;
    const totalQuestions = Object.values(exam.breakdown).reduce<number>((s, n) => s + (n as number), 0);
    if (totalQuestions <= 0) { toast.error("Approve an estimate with at least 1 question first."); return; }
    const types = parseMix(examQuestionTypes);
    if (types.length === 0) { toast.error("Select at least one question type."); return; }

    setGeneratingExamId(examId);
    setGenProgress({ current: 0, total: totalQuestions });

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/generate-exam-questions`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course_id: courseId,
          exam_id: examId,
          length_min: exam.lengthMin,
          total_questions: totalQuestions,
          question_types: types,
        }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({} as any));
        if (body?.error === "exam_archived") {
          toast.error(body.message ?? "This exam is archived. Restore it before regenerating questions.");
          return;
        }
      }
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Generation failed: ${res.status} ${txt.slice(0, 200)}`);
      }


      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalErr: string | null = null;
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.event === "progress") {
              setGenProgress({ current: payload.generated, total: payload.total });
            } else if (payload.event === "done") {
              done = true;
            } else if (payload.event === "error") {
              finalErr = payload.error ?? "Unknown error";
              done = true;
            }
          } catch { /* ignore parse */ }
        }
      }
      if (finalErr) throw new Error(finalErr);

      await refreshExamCounts();
      if (courseId) bumpCacheVersion("questions", courseId);
      toast.success(`Generated ${totalQuestions} exam questions`);
    } catch (e: any) {
      console.error("generate exam questions failed:", e);
      toast.error(e?.message ?? "Failed to generate questions");
    } finally {
      setGeneratingExamId(null);
      setGenProgress(null);
    }
  };

  const handleSave = async () => {
    try {
      // Defensive: only persist exams that exist as ACTIVE rows in course_exams.
      // This drops any stale/archived id that might still linger in local state.
      const activeIdSet = new Set(activeCourseExams.map(e => e.id));
      const cleanedSchedule = examSchedule.filter(e => activeIdSet.has(e.id));
      const firstExam = cleanedSchedule[0];
      await saveTASettings({
        ...settings,
        // Mirror first card to legacy fields for backward compat
        examTimeLimit: firstExam?.lengthMin ?? 60,
        examQuestionMix: examQuestionTypes,
        examPresentation: "all_at_once",
        examApproved: allExamsApproved,
        examEnabled: examEnabled || allExamsApproved,
        examManualQuestions: false,
        examManualCount: firstExam
          ? Object.values(firstExam.breakdown).reduce((s, n) => s + n, 0)
          : null,
        examSchedule: cleanedSchedule,
      });
      if ((allExamsApproved || examEnabled) && user?.id && courseId) {
        void markStepCompleted(user.id, "exam-mode", courseId, { source: "ExamMode.handleSave" });
      }
    } catch {
      toast.error("Failed to save exam settings. Please try again.");
      throw new Error("save failed");
    }
  };


  // ── Custom question handlers ──
  const openAddDialog = (preselectExamId?: string) => {
    setEditingId(null);
    setFormQuestion(""); setFormAnswer(""); setFormTopic("");
    setFormType("MCQ"); setFormOptions(["", "", "", ""]); setFormCorrectIndex(0);
    setFormDifficulty("Medium");
    setFormBloom(2);
    setFormExplanation("");
    setFormDifficultyEstimate("0.50");
    setFormBloomJustification("");
    setFormDifficultyJustification("");
    // Default: preselected exam, else first exam if any, else null
    setFormExamId(preselectExamId ?? (labeledSchedule[0]?.id ?? null));
    setDialogOpen(true);
    // Refresh concepts so newly-added ones show up without page reload
    refetchConcepts();
  };

  const openEditDialog = (q: EditableQuestion) => {
    setEditingId(q.id);
    setFormQuestion(q.question); setFormAnswer(q.answer || ""); setFormTopic(q.topic);
    setFormType(q.type);
    setFormOptions(q.options?.length ? [...q.options] : ["", "", "", ""]);
    setFormCorrectIndex(q.correctIndex ?? 0);
    setFormExamId(q.exam_id ?? null);
    setFormDifficulty((q.difficulty as "Easy" | "Medium" | "Hard") ?? "Medium");
    setFormBloom(q.bloom_level ?? 2);
    setFormExplanation(q.explanation ?? "");
    setFormDifficultyEstimate(
      q.difficulty_estimate != null ? Number(q.difficulty_estimate).toFixed(2) : "0.50"
    );
    setFormBloomJustification(q.bloom_justification ?? "");
    setFormDifficultyJustification(q.difficulty_justification ?? "");
    setDialogOpen(true);
  };

  const handleSaveQuestion = async () => {
    if (!formQuestion.trim() || !formTopic || !courseId || !user) return;
    // Parse & validate difficulty_estimate (0.00–1.00)
    const parsedEst = Number.parseFloat(formDifficultyEstimate);
    if (!Number.isFinite(parsedEst) || parsedEst < 0 || parsedEst > 1) {
      toast.error("Difficulty estimate must be a number between 0.00 and 1.00");
      return;
    }
    const clampedEst = Math.round(parsedEst * 100) / 100;
    setSaving(true);
    const isMCQ = formType === "MCQ";
    const isTF = formType === "True/False";
    const filteredOptions = isMCQ ? formOptions.filter(o => o.trim()) : null;
    const answer = isMCQ ? (filteredOptions?.[formCorrectIndex] || "") : formAnswer;
    // Resolve concept_id from topic (concept_code). Required by DB schema + trigger.
    const { data: conceptRow } = await supabase
      .from("concepts").select("id").eq("course_id", courseId).eq("concept_code", formTopic).maybeSingle();
    if (!conceptRow?.id) {
      setSaving(false);
      toast.error(`Topic "${formTopic}" must match an existing course concept code.`);
      return;
    }
    const trimmedExplanation = formExplanation.trim();
    const trimmedBloomJust = formBloomJustification.trim();
    const trimmedDiffJust = formDifficultyJustification.trim();
    const row = {
      course_id: courseId, teacher_id: user.id, concept_id: conceptRow.id,
      mode: "exam" as const, question_type: formType,
      question_text: formQuestion, answer, topic: formTopic, difficulty: formDifficulty,
      options: isMCQ ? filteredOptions : isTF ? ["True", "False"] : null,
      correct_index: isMCQ ? formCorrectIndex : isTF ? (formAnswer === "True" ? 0 : 1) : null,
      explanation: trimmedExplanation || null,
      quiz_day: null as number | null,
      exam_id: formExamId,
      bloom_level: formBloom,
      difficulty_estimate: clampedEst,
      bloom_justification: trimmedBloomJust || null,
      difficulty_justification: trimmedDiffJust || null,
    };

    const extraMeta = {
      bloom_level: formBloom,
      explanation: trimmedExplanation || null,
      difficulty_estimate: clampedEst,
      bloom_justification: trimmedBloomJust || null,
      difficulty_justification: trimmedDiffJust || null,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("assessment_questions").update(row).eq("id", editingId);
        if (error) throw error;
        setQuestions(prev => prev.map(q => q.id === editingId ? {
          id: editingId, question: formQuestion, answer, topic: formTopic,
          difficulty: formDifficulty, type: formType, exam_id: formExamId,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
          ...extraMeta,
        } : q));
        toast.success("Question updated");
      } else {
        const { data, error } = await supabase.from("assessment_questions").insert(row).select("id").single();
        if (error) throw error;
        setQuestions(prev => [...prev, {
          id: data.id, question: formQuestion, answer, topic: formTopic,
          difficulty: formDifficulty, type: formType, exam_id: formExamId,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
          ...extraMeta,
        }]);
        toast.success("Question added");
      }
      setDialogOpen(false);
      if (courseId) bumpCacheVersion("questions", courseId);
    } catch { toast.error("Failed to save question"); }
    finally { setSaving(false); }
  };

  const handleDeleteQuestion = async (id: string) => {
    const { error } = await supabase.from("assessment_questions").delete().eq("id", id);
    if (error) { toast.error("Failed to delete question"); return; }
    setQuestions(prev => prev.filter(q => q.id !== id));
    if (courseId) bumpCacheVersion("questions", courseId);
    toast.success("Question deleted");
  };

  const updateOption = (index: number, value: string) => {
    setFormOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const toggleFilterType = (type: string) => {
    setFilterTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const filteredQuestions = filterTypes.length === 0
    ? questions
    : questions.filter(q => filterTypes.includes(q.type));

  const typeBadgeColor = (type: QuestionType) => {
    switch (type) {
      case "MCQ": return "bg-primary/10 text-primary";
      case "True/False": return "bg-blue-500/10 text-blue-600";
      case "Short Answer": return "bg-warning/10 text-warning";
      case "Code Practice": return "bg-accent/10 text-accent";
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Course Setup
        </Button>

        <div className="mb-8">
          <h1 className="font-heading text-3xl font-bold">Exam Mode Settings</h1>
          <p className="text-muted-foreground">Configure exam simulation rules and manage your custom exam questions.</p>
        </div>

        <div className="space-y-6">
          {/* Recommendation banner */}
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">These rules are recommendations only</p>
              <p>Students can still adjust exam settings (time limit, question count) if they choose. Your configuration serves as the recommended default.</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exam Simulation Rules</CardTitle>
              <CardDescription>Configure exam parameters for students</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Question Types</Label>
                <p className="text-xs text-muted-foreground">Select which question types to include in exams</p>
                <QuestionTypeSelector value={examQuestionTypes} onChange={handleExamTypeChange} allowedTypes={ALLOWED_EXAM_TYPES} />
              </div>

              {/* ── Exam Schedule ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Number of Mock Tests Generated</Label>
                    <p className="text-xs text-muted-foreground">Add mock tests as needed</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="icon" className="h-8 w-8"
                      onClick={handleRemoveExamRequest}
                      aria-label="Remove exam"
                    >−</Button>
                    <span className="w-6 text-center text-sm font-bold">{examSchedule.length}</span>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8"
                      onClick={handleAddExam}
                      disabled={addingExam}
                      aria-label="Add exam"
                    >+</Button>

                  </div>
                </div>

                <div className="space-y-3">
                  {labeledSchedule.map(exam => {
                    const total = Object.values(exam.breakdown).reduce<number>((s, n) => s + (n as number), 0);
                    const isEditing = !!editingCardIds[exam.id];
                    const breakdownEntries = Object.entries(exam.breakdown);
                    const isManual = exam.source === "manual";
                    const manualCount = manualExamCounts[exam.id] ?? 0;
                    const canApprove = isManual ? manualCount >= 1 : breakdownEntries.length > 0;
                    return (
                      <div key={exam.id} className={`rounded-lg border p-4 space-y-3 ${exam.publishedAt ? "border-emerald-500/50 bg-emerald-50/40" : exam.approved ? "border-primary/40 bg-primary/5" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{exam.label}</p>
                            {exam.publishedAt ? (
                              <Badge variant="outline" className="border-emerald-500/60 bg-emerald-500/10 text-[10px] text-emerald-700">
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Hidden from students
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant={exam.publishedAt ? "outline" : "default"}
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!exam.approved || publishingExamId === exam.id}
                              onClick={() => handleTogglePublish(exam.id)}
                              title={exam.approved
                                ? (exam.publishedAt ? "Hide from students" : "Make visible to students")
                                : "Approve first to enable publishing"}
                            >
                              {publishingExamId === exam.id ? (
                                <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Working…</>
                              ) : exam.publishedAt ? "Unpublish" : "Publish"}
                            </Button>

                            <Select
                              value={exam.source ?? "generated"}
                              onValueChange={(v) => handleSourceChange(exam.id, v as "generated" | "manual")}
                            >
                              <SelectTrigger className="h-8 w-[160px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="generated">AI-Generated</SelectItem>
                                <SelectItem value="manual">Manual (Teacher)</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                              onClick={() => requestArchiveExam(exam.id)}
                              aria-label={`Archive ${exam.label}`}
                              title="Archive this mock test (questions and student submissions are preserved)"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">Length</Label>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[exam.lengthMin]}
                              onValueChange={(v) => handleLengthChange(exam.id, v[0])}
                              min={15} max={180} step={15} className="flex-1"
                            />
                            <span className="w-16 text-right text-sm font-bold">{exam.lengthMin} min</span>
                          </div>
                        </div>

                        {isManual ? (
                          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs text-muted-foreground">
                                <span className="font-bold text-foreground">{manualCount}</span> manual question{manualCount === 1 ? "" : "s"} assigned
                              </span>
                            </div>
                            {manualCount === 0 && (
                              <p className="text-xs text-muted-foreground">Add at least 1 question below to approve this exam.</p>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => openAddDialog(exam.id)}
                              >
                                <Plus className="mr-1 h-3 w-3" /> Add Question
                              </Button>
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs"
                                disabled={manualCount === 0}
                                onClick={() => setViewExamId(exam.id)}
                              >
                                View Questions
                              </Button>
                              <Button
                                variant={exam.approved ? "outline" : "default"}
                                size="sm" className="h-7 text-xs"
                                disabled={!canApprove}
                                onClick={() => handleApproveExam(exam.id)}
                              >
                                {exam.approved ? <><Check className="mr-1 h-3 w-3" /> Approved</> : "Approve Exam"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Calculator className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs text-muted-foreground">
                                Total <span className="font-bold text-foreground">{total} questions</span>
                                {(() => {
                                  const estimate = questionEstimate(exam.lengthMin, examQuestionTypes).total;
                                  return (
                                    <span className="ml-1 text-[10px] text-muted-foreground">
                                      (time-based estimate: {estimate})
                                    </span>
                                  );
                                })()}
                              </span>
                            </div>
                            {breakdownEntries.length === 0 ? (
                              <p className="text-xs text-destructive">Select at least one question type above.</p>
                            ) : (
                              <div className="space-y-1">
                                {breakdownEntries.map(([type, count]) => (
                                  <div key={type} className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">{type}</span>
                                    <Input
                                      type="number" min={0}
                                      className="h-7 w-20 text-xs text-right"
                                      value={count as number}
                                      onChange={(e) => handleBreakdownNumberChange(exam.id, type, parseInt(e.target.value))}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                            {(() => {
                              const estimate = questionEstimate(exam.lengthMin, examQuestionTypes).total;
                              if (total > estimate) {
                                return (
                                  <p className="text-xs text-amber-600">
                                    Heads up: {total} questions in {exam.lengthMin} min is above the time-based estimate of {estimate}. Students may run out of time.
                                  </p>
                                );
                              }
                              return null;
                            })()}
                            <div className="flex items-center gap-2 pt-1">
                              {exam.breakdownDirty && breakdownEntries.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleResetBreakdown(exam.id)}>
                                  Reset to estimate
                                </Button>
                              )}

                              <Button
                                variant={exam.approved ? "outline" : "default"}
                                size="sm" className="h-7 text-xs"
                                disabled={!canApprove}
                                onClick={() => handleApproveExam(exam.id)}
                              >
                                {exam.approved ? <><Check className="mr-1 h-3 w-3" /> Approved</> : "Approve Estimate"}
                              </Button>
                              {(() => {
                                const generatedCount = examQuestionCounts[exam.id] ?? 0;
                                const isGenerating = generatingExamId === exam.id;
                                const hasExisting = generatedCount > 0;
                                if (hasExisting && !isGenerating) {
                                  return (
                                    <>
                                      <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary">
                                        <Check className="h-3 w-3" /> {generatedCount} questions generated
                                      </span>
                                      <Button
                                        variant="outline" size="sm" className="h-7 text-xs"
                                        onClick={() => setViewExamId(exam.id)}
                                      >
                                        View
                                      </Button>
                                    </>
                                  );
                                }
                                return (
                                  <Button
                                    variant="outline" size="sm" className="h-7 text-xs"
                                    disabled={
                                      breakdownEntries.length === 0 ||
                                      !exam.approved ||
                                      !!generatingExamId
                                    }
                                    onClick={() => handleGenerateQuestions(exam.id)}
                                  >
                                    {isGenerating ? (
                                      <>
                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        Generating {genProgress?.current ?? 0}/{genProgress?.total ?? 0}…
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="mr-1 h-3 w-3" /> Generate Questions
                                      </>
                                    )}
                                  </Button>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Global approval state ── */}
              <div className={`flex items-center justify-between rounded-lg border p-4 ${allExamsApproved ? "border-primary/30 bg-primary/5" : ""}`}>
                <div>
                  <p className="text-sm font-medium">Exam Rules Status</p>
                  <p className="text-xs text-muted-foreground">
                    {!typesSelected
                      ? "Select at least one question type above before approving exams"
                      : allExamsApproved
                        ? `All ${examSchedule.length} exam${examSchedule.length > 1 ? "s" : ""} approved`
                        : `Approve all ${examSchedule.length} exam${examSchedule.length > 1 ? "s" : ""} above to continue`}
                  </p>
                </div>
                {allExamsApproved && <Check className="h-5 w-5 text-primary" />}
              </div>
            </CardContent>
          </Card>

          {/* ── Archived Mock Tests ── */}
          {archivedCourseExams.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Archive className="h-5 w-5" /> Archived Mock Tests
                </CardTitle>
                <CardDescription>
                  Hidden from students. Questions and past student submissions are preserved. Restore to bring an exam back into the active schedule.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {archivedCourseExams.map(ex => {
                  const qCount = examQuestionCounts[ex.id] ?? 0;
                  const archivedDate = ex.archived_at ? new Date(ex.archived_at).toLocaleDateString() : "";
                  return (
                    <div key={ex.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{ex.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Archived {archivedDate} · {qCount} question{qCount === 1 ? "" : "s"} preserved · {ex.length_min} min
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => setViewExamId(ex.id)}
                          disabled={qCount === 0}
                        >
                          View Questions
                        </Button>
                        <Button
                          variant="default" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => handleRestoreExam(ex.id)}
                          disabled={restoringExamId === ex.id}
                          title="Restore to active schedule"
                        >
                          {restoringExamId === ex.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Restore
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openDeleteArchivedExam(ex.id, ex.label)}
                          disabled={deletingExamId === ex.id}
                          title="Permanently delete this archived exam"
                        >
                          {deletingExamId === ex.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* ── Custom Exam Questions (merged from Assessments tab) ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck className="h-5 w-5" /> Custom Exam Questions
                  </CardTitle>
                  <CardDescription>Add any custom exam questions you want students to see during their practice exams. These appear alongside AI-generated questions.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openAddDialog()}><Plus className="mr-1 h-4 w-4" /> Add Question</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filters</span>
                  {filterTypes.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => setFilterTypes([])}>Clear all</Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["MCQ", "True/False"] as QuestionType[]).map(type => (
                    <button key={type} onClick={() => toggleFilterType(type)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${filterTypes.includes(type) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {questionsLoading ? (
                <div className="flex items-center justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Showing <strong className="text-foreground">{filteredQuestions.length}</strong> of {questions.length} custom exam questions
                  </p>
                  <div className="space-y-3">
                    {filteredQuestions.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed p-8 text-center">
                        <p className="text-sm text-muted-foreground">No custom exam questions yet. Add your first question above.</p>
                      </div>
                    ) : filteredQuestions.map((q) => (
                      <div key={q.id} className="rounded-lg border p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] ${typeBadgeColor(q.type)}`}>{q.type}</Badge>
                            <span className="text-xs text-muted-foreground">{q.topic}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {q.exam_id
                                ? (labeledSchedule.find(e => e.id === q.exam_id)?.label ?? "Unknown exam")
                                : "Unassigned"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditDialog(q)} className="rounded p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            <button onClick={() => handleDeleteQuestion(q.id)} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                        <p className="text-sm font-medium whitespace-pre-wrap">{q.question}</p>
                        {q.type === "MCQ" && q.options && (
                          <div className="mt-2 space-y-1">
                            {q.options.map((opt, i) => (
                              <p key={i} className={`text-xs ${i === q.correctIndex ? "text-mastery-expert font-medium" : "text-muted-foreground"}`}>
                                {String.fromCharCode(65 + i)}. {opt}
                              </p>
                            ))}
                          </div>
                        )}
                        {(q.type !== "MCQ") && q.answer && (
                          <p className="text-xs text-muted-foreground mt-2"><span className="font-medium text-foreground">Answer:</span> {q.answer}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <SetupModuleNav
            nextPath="/teacher/setup/enrollment"
            nextLabel="Save & Continue to Enrollment"
            nextDisabled={!canContinue}
            onNext={handleSave}
          />
          {!canContinue && (
            <p className="text-xs text-destructive text-right">Please approve exam rules to continue</p>
          )}
        </div>
      </div>

      {/* Add/Edit Question Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Question — Exam Mode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea value={formQuestion} onChange={e => setFormQuestion(e.target.value)} placeholder="Enter question text..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Assign to Exam</Label>
              <Select
                value={formExamId ?? "__unassigned"}
                onValueChange={(v) => setFormExamId(v === "__unassigned" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select an exam" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned (library only)</SelectItem>
                  {labeledSchedule.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label} — {e.source === "manual" ? "Manual" : "AI-Generated"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {labeledSchedule.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Add an exam above to assign this question to it; otherwise it stays in the library and won't appear in any student exam.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={formDifficulty} onValueChange={(v) => setFormDifficulty(v as "Easy" | "Medium" | "Hard")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bloom's Level</Label>
              <Select value={String(formBloom)} onValueChange={(v) => setFormBloom(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Remember</SelectItem>
                  <SelectItem value="2">2 — Understand</SelectItem>
                  <SelectItem value="3">3 — Apply</SelectItem>
                  <SelectItem value="4">4 — Analyze</SelectItem>
                  <SelectItem value="5">5 — Evaluate</SelectItem>
                  <SelectItem value="6">6 — Create</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Cognitive level assessed by this question.</p>
            </div>
            <div className="space-y-2">
              <Label>Difficulty Estimate</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={formDifficultyEstimate}
                onChange={(e) => setFormDifficultyEstimate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Expected P(incorrect) for a typical student, 0.00–1.00. Used for mastery scoring.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Bloom Justification</Label>
              <Textarea
                rows={2}
                value={formBloomJustification}
                onChange={(e) => setFormBloomJustification(e.target.value)}
                placeholder="Why this Bloom's level fits the question (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label>Difficulty Justification</Label>
              <Textarea
                rows={2}
                value={formDifficultyJustification}
                onChange={(e) => setFormDifficultyJustification(e.target.value)}
                placeholder="Why this difficulty was chosen (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label>Explanation</Label>
              <Textarea
                rows={2}
                value={formExplanation}
                onChange={(e) => setFormExplanation(e.target.value)}
                placeholder="Shown to students after they submit an answer (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Concept <span className="text-destructive">*</span>
              </Label>
              <Select value={formTopic} onValueChange={setFormTopic} disabled={concepts.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={concepts.length === 0 ? "No concepts yet" : "Select a concept"} />
                </SelectTrigger>
                <SelectContent>
                  {concepts.map(c => (
                    <SelectItem key={c.id} value={c.concept_code}>{c.concept_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {concepts.length === 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>No concepts found for this course.</span>
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => navigate("/teacher/setup/concept-review")}
                  >
                    Add concepts
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => refetchConcepts()}
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Used to track concept mastery for this question.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={formType} onValueChange={v => setFormType(v as QuestionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCQ">Multiple Choice</SelectItem>
                  <SelectItem value="True/False">True / False</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formType === "MCQ" ? (
              <div className="space-y-3">
                <Label>Options (select the correct one)</Label>
                {formOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormCorrectIndex(i)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors ${i === formCorrectIndex ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                    >{String.fromCharCode(65 + i)}</button>
                    <Input value={opt} onChange={e => updateOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} className="h-8 text-sm" />
                  </div>
                ))}
              </div>
            ) : formType === "True/False" ? (
              <div className="space-y-2">
                <Label>Correct Answer</Label>
                <Select value={formAnswer} onValueChange={v => setFormAnswer(v)}>
                  <SelectTrigger><SelectValue placeholder="Select correct answer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="True">True</SelectItem>
                    <SelectItem value="False">False</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Answer</Label>
                <Textarea value={formAnswer} onChange={e => setFormAnswer(e.target.value)} placeholder="Expected answer..." rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveQuestion} disabled={saving || !formQuestion.trim() || !formTopic}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? "Update" : "Add"} Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExamQuestionsViewDialog
        open={!!viewExamId}
        onOpenChange={(o) => { if (!o) setViewExamId(null); }}
        courseId={courseId}
        examId={viewExamId}
        examLabel={labeledSchedule.find(e => e.id === viewExamId)?.label ?? "Exam"}
      />

      <AlertDialog open={!!confirmRemoveId} onOpenChange={(o) => !o && setConfirmRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              This exam is approved. Removing it will discard its question breakdown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveExam}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmArchiveExamId} onOpenChange={(o) => !o && !archivingExam && setConfirmArchiveExamId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this mock test?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const exam = labeledSchedule.find(e => e.id === confirmArchiveExamId);
                const label = exam?.label ?? "This mock test";
                const generatedCount = exam ? (examQuestionCounts[exam.id] ?? 0) : 0;
                const manualCount = exam ? (manualExamCounts[exam.id] ?? 0) : 0;
                const totalQ = generatedCount + manualCount;
                return `${label} will be hidden from students. Its ${totalQ} question${totalQ === 1 ? "" : "s"} and any past student submissions stay intact — you can restore the exam from the "Archived mock tests" section below at any time.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archivingExam}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); executeArchiveExam(); }} disabled={archivingExam}>
              {archivingExam ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteExamTarget}
        onOpenChange={(o) => { if (!o && !deletingExamId) setDeleteExamTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete "{deleteExamTarget?.label}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This will permanently remove the exam and all of its questions. <strong>This cannot be undone.</strong>
                </p>
                <p className="text-muted-foreground">
                  {deleteSubmissionCount === null
                    ? "Checking past student submissions…"
                    : deleteSubmissionCount === 0
                      ? "No past student submissions are linked to this exam."
                      : `${deleteSubmissionCount} past student submission${deleteSubmissionCount === 1 ? "" : "s"} will be preserved in analytics but will show as "Deleted exam" since the exam record will be gone.`}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingExamId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDeleteArchivedExam(); }}
              disabled={!!deletingExamId || deleteSubmissionCount === null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingExamId ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExamMode;
