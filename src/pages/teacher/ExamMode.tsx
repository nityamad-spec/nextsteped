import { useState, useMemo, useEffect } from "react";
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

const MAX_EXAMS = 10;
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

  // ── Exam config state ──
  const [settings, setSettings] = useState(taSettings);
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix || "mixed");
  const [examEnabled, setExamEnabled] = useState(taSettings.examEnabled ?? false);

  // Multi-exam schedule (replaces single examLength + single estimate)
  const buildInitialSchedule = (): ExamScheduleItem[] => {
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
  const [confirmDeleteExamId, setConfirmDeleteExamId] = useState<string | null>(null);
  const [deletingExam, setDeletingExam] = useState(false);

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
  const [saving, setSaving] = useState(false);
  const [concepts, setConcepts] = useState<{ id: string; concept_code: string }[]>([]);

  // Per-exam generated-question state
  const [examQuestionCounts, setExamQuestionCounts] = useState<Record<string, number>>({});
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [viewExamId, setViewExamId] = useState<string | null>(null);




  useEffect(() => {
    if (!loading) {
      setSettings(taSettings);
      setExamQuestionTypes(taSettings.examQuestionMix || "mixed");
      setExamEnabled(taSettings.examEnabled ?? false);
      setExamSchedule(buildInitialSchedule());
      setEditingCardIds({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, taSettings]);

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
        })));
        const counts: Record<string, number> = {};
        for (const row of data as any[]) {
          const isGenerated = typeof row.item_code === "string" && row.item_code.startsWith("exam-");
          if (isGenerated && row.exam_id) counts[row.exam_id] = (counts[row.exam_id] ?? 0) + 1;
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
      const isGenerated = typeof row.item_code === "string" && row.item_code.startsWith("exam-");
      if (isGenerated && row.exam_id) counts[row.exam_id] = (counts[row.exam_id] ?? 0) + 1;
    }
    setExamQuestionCounts(counts);
  };




  // ── Schedule mutation helpers ──
  const updateExam = (id: string, patch: Partial<ExamScheduleItem>) => {
    setExamSchedule(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  // When the global question types change, refresh each card's breakdown
  // (preserve approved state only if the type set is unchanged for that card)
  useEffect(() => {
    setExamSchedule(prev => prev.map(e => e.source === "manual" ? e : ({
      ...e,
      breakdown: questionEstimate(e.lengthMin, examQuestionTypes).breakdown,
      approved: false,
    })));
    setEditingCardIds({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examQuestionTypes]);

  const handleExamTypeChange = (v: string) => setExamQuestionTypes(v);

  const handleAddExam = () => {
    if (examSchedule.length >= MAX_EXAMS) return;
    const lengthMin = 60;
    setExamSchedule(prev => [...prev, {
      id: newExamId(),
      kind: "final",
      lengthMin,
      breakdown: questionEstimate(lengthMin, examQuestionTypes).breakdown,
      approved: false,
      source: "generated",
    }]);
  };

  const handleSourceChange = (id: string, source: "generated" | "manual") => {
    updateExam(id, { source, approved: false });
  };

  const handleRemoveExamRequest = () => {
    if (examSchedule.length <= 1) return;
    const last = examSchedule[examSchedule.length - 1];
    if (last.approved) {
      setConfirmRemoveId(last.id);
    } else {
      setExamSchedule(prev => prev.slice(0, -1));
    }
  };
  const confirmRemoveExam = () => {
    setExamSchedule(prev => prev.slice(0, -1));
    setConfirmRemoveId(null);
  };

  const requestDeleteExam = (id: string) => {
    if (examSchedule.length <= 1) {
      toast.error("At least one mock test is required.");
      return;
    }
    setConfirmDeleteExamId(id);
  };

  const executeDeleteExam = async () => {
    const id = confirmDeleteExamId;
    if (!id || !courseId) return;
    setDeletingExam(true);
    try {
      // Delete AI-generated questions for this exam
      const { data: existing } = await supabase
        .from("assessment_questions")
        .select("id, item_code")
        .eq("course_id", courseId)
        .eq("mode", "exam")
        .eq("exam_id", id);
      const generatedIds = ((existing as any[]) ?? [])
        .filter(r => typeof r.item_code === "string" && r.item_code.startsWith("exam-"))
        .map(r => r.id);
      if (generatedIds.length > 0) {
        const { error: delErr } = await supabase
          .from("assessment_questions").delete().in("id", generatedIds);
        if (delErr) throw delErr;
      }
      // Unassign manual questions previously linked to this exam
      const { error: updErr } = await supabase
        .from("assessment_questions")
        .update({ exam_id: null })
        .eq("course_id", courseId)
        .eq("mode", "exam")
        .eq("exam_id", id);
      if (updErr) throw updErr;

      setExamSchedule(prev => prev.filter(e => e.id !== id));
      setEditingCardIds(prev => { const { [id]: _, ...rest } = prev; return rest; });
      setExamQuestionCounts(prev => { const { [id]: _, ...rest } = prev; return rest; });
      setQuestions(prev => prev.map(q => q.exam_id === id ? { ...q, exam_id: null } : q));
      bumpCacheVersion("questions", courseId);
      toast.success("Mock test deleted");
    } catch (e: any) {
      console.error("delete exam failed:", e);
      toast.error(e?.message ?? "Failed to delete mock test");
    } finally {
      setDeletingExam(false);
      setConfirmDeleteExamId(null);
    }
  };

  const handleLengthChange = (id: string, v: number) => {
    const exam = examSchedule.find(e => e.id === id);
    if (!exam) return;
    updateExam(id, {
      lengthMin: v,
      breakdown: questionEstimate(v, examQuestionTypes).breakdown,
      approved: false,
    });
    setEditingCardIds(prev => ({ ...prev, [id]: false }));
  };

  const handleKindChange = (id: string, kind: "midterm" | "final") => {
    updateExam(id, { kind, approved: false });
  };

  const handleEditBreakdown = (id: string) => {
    setEditingCardIds(prev => ({ ...prev, [id]: true }));
    updateExam(id, { approved: false });
  };

  const handleBreakdownNumberChange = (id: string, type: string, value: number) => {
    const exam = examSchedule.find(e => e.id === id);
    if (!exam) return;
    updateExam(id, {
      breakdown: { ...exam.breakdown, [type]: Math.max(0, value || 0) },
      approved: false,
    });
  };

  const handleApproveExam = (id: string) => {
    setEditingCardIds(prev => ({ ...prev, [id]: false }));
    updateExam(id, { approved: !examSchedule.find(e => e.id === id)?.approved });
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
      const firstExam = examSchedule[0];
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
        examSchedule,
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
    // Default: preselected exam, else first manual exam if any, else null
    setFormExamId(preselectExamId ?? (manualExams[0]?.id ?? null));
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
    setDialogOpen(true);
  };

  const handleSaveQuestion = async () => {
    if (!formQuestion.trim() || !formTopic || !courseId || !user) return;
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
    const row = {
      course_id: courseId, teacher_id: user.id, concept_id: conceptRow.id,
      mode: "exam" as const, question_type: formType,
      question_text: formQuestion, answer, topic: formTopic, difficulty: "Medium" as const,
      options: isMCQ ? filteredOptions : isTF ? ["True", "False"] : null,
      correct_index: isMCQ ? formCorrectIndex : isTF ? (formAnswer === "True" ? 0 : 1) : null,
      explanation: null as string | null, quiz_day: null as number | null,
      exam_id: formExamId,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("assessment_questions").update(row).eq("id", editingId);
        if (error) throw error;
        setQuestions(prev => prev.map(q => q.id === editingId ? {
          id: editingId, question: formQuestion, answer, topic: formTopic,
          difficulty: "Medium", type: formType, exam_id: formExamId,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
        } : q));
        toast.success("Question updated");
      } else {
        const { data, error } = await supabase.from("assessment_questions").insert(row).select("id").single();
        if (error) throw error;
        setQuestions(prev => [...prev, {
          id: data.id, question: formQuestion, answer, topic: formTopic,
          difficulty: "Medium", type: formType, exam_id: formExamId,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
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
                    <p className="text-xs text-muted-foreground">Add 1 – {MAX_EXAMS} mock tests</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="icon" className="h-8 w-8"
                      onClick={handleRemoveExamRequest}
                      disabled={examSchedule.length <= 1}
                      aria-label="Remove exam"
                    >−</Button>
                    <span className="w-6 text-center text-sm font-bold">{examSchedule.length}</span>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8"
                      onClick={handleAddExam}
                      disabled={examSchedule.length >= MAX_EXAMS}
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
                      <div key={exam.id} className={`rounded-lg border p-4 space-y-3 ${exam.approved ? "border-primary/40 bg-primary/5" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{exam.label}</p>
                          <div className="flex items-center gap-2">
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
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => requestDeleteExam(exam.id)}
                              disabled={examSchedule.length <= 1}
                              aria-label={`Delete ${exam.label}`}
                              title={examSchedule.length <= 1 ? "At least one mock test is required" : "Delete this mock test"}
                            >
                              <Trash2 className="h-4 w-4" />
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
                                Estimated <span className="font-bold text-foreground">{total} questions</span>
                                {breakdownEntries.length > 0 && (
                                  <>
                                    {" "}({breakdownEntries.map(([t, c]) => `${t} ${c}`).join(" · ")})
                                  </>
                                )}
                              </span>
                            </div>
                            {breakdownEntries.length === 0 ? (
                              <p className="text-xs text-destructive">Select at least one question type above.</p>
                            ) : (
                              <div className="space-y-1">
                                {breakdownEntries.map(([type, count]) => (
                                  <div key={type} className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">{type}</span>
                                    {isEditing ? (
                                      <Input
                                        type="number" min={0}
                                        className="h-7 w-16 text-xs text-right"
                                        value={count as number}
                                        onChange={(e) => handleBreakdownNumberChange(exam.id, type, parseInt(e.target.value))}
                                      />
                                    ) : (
                                      <span className="text-sm font-bold">{count as number}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              {!isEditing && breakdownEntries.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleEditBreakdown(exam.id)}>
                                  <Pencil className="mr-1 h-3 w-3" /> Edit Breakdown
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
                  {manualExams.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.label} — Manual</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualExams.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No manual exams yet. Switch an exam above to "Manual" to assign this question to it; otherwise it stays in the library and won't appear in any student exam.
                </p>
              )}
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

      <AlertDialog open={!!confirmDeleteExamId} onOpenChange={(o) => !o && !deletingExam && setConfirmDeleteExamId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mock test?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const exam = labeledSchedule.find(e => e.id === confirmDeleteExamId);
                if (!exam) return "This will permanently remove the mock test.";
                const isManual = exam.source === "manual";
                const generatedCount = examQuestionCounts[exam.id] ?? 0;
                const manualCount = manualExamCounts[exam.id] ?? 0;
                if (isManual) {
                  return `${exam.label} will be removed. ${manualCount} manual question${manualCount === 1 ? "" : "s"} assigned to it will be returned to the library (unassigned).`;
                }
                return `${exam.label} will be removed${generatedCount > 0 ? ` along with its ${generatedCount} generated question${generatedCount === 1 ? "" : "s"}` : ""}. This cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingExam}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); executeDeleteExam(); }} disabled={deletingExam}>
              {deletingExam ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExamMode;
