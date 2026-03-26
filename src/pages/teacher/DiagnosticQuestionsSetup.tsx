import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowRight, ArrowLeft, Brain, Plus, Pencil, Trash2, Check, X,
  ChevronDown, ChevronUp, Info, Settings2, AlertTriangle, Loader2,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type QuestionType = "mcq" | "true_false" | "short_answer" | "code";

const questionTypeLabels: Record<QuestionType, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  code: "Code",
};

const questionTypeColors: Record<QuestionType, string> = {
  mcq: "bg-primary/10 text-primary",
  true_false: "bg-accent/10 text-accent-foreground",
  short_answer: "bg-secondary text-secondary-foreground",
  code: "bg-destructive/10 text-destructive",
};

const bloomLabels: Record<number, string> = {
  1: "Remember",
  2: "Understand",
  3: "Apply",
  4: "Analyze",
  5: "Evaluate",
  6: "Create",
};

const difficultyToEstimate = (d: "Easy" | "Medium" | "Hard"): number =>
  d === "Easy" ? 0.2 : d === "Medium" ? 0.5 : 0.8;

const estimateToDifficulty = (e: number): "Easy" | "Medium" | "Hard" =>
  e <= 0.33 ? "Easy" : e <= 0.66 ? "Medium" : "Hard";

interface DiagnosticQuestion {
  id: string;
  dbId?: string; // UUID from database
  question: string;
  type: QuestionType;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  explanation: string;
  approved: boolean;
  itemId: string;
  difficultyEstimate: number;
  bloomLevel: number;
  bloomJustification: string;
  difficultyJustification: string;
  isDistractor: boolean;
  conceptId?: string; // FK to concepts table
  inTest: boolean;
}

interface ConceptOption {
  id: string;
  concept_code: string;
  weight: number;
}

const makeId = () => `dq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const generateItemId = (topic: string, index: number): string => {
  const sanitized = topic.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "General";
  return `COURSE/${sanitized}/Q${String(index + 1).padStart(3, "0")}`;
};

const emptyQuestion = (type: QuestionType = "mcq", index: number = 0): DiagnosticQuestion => ({
  id: makeId(),
  question: "",
  type,
  topic: "",
  difficulty: "Medium",
  options: type === "mcq" ? ["", "", "", ""] : type === "true_false" ? ["True", "False"] : undefined,
  correctIndex: type === "mcq" || type === "true_false" ? 0 : undefined,
  correctAnswer: type === "short_answer" || type === "code" ? "" : undefined,
  explanation: "",
  approved: false,
  itemId: generateItemId("General", index),
  difficultyEstimate: 0.5,
  bloomLevel: 1,
  bloomJustification: "",
  difficultyJustification: "",
  isDistractor: false,
  conceptId: undefined,
  inTest: false,
});

// --- DB helpers ---

const answerLetters = ["A", "B", "C", "D", "E", "F"];

function dbRowToQuestion(row: any): DiagnosticQuestion {
  const options = row.options as string[] | null;
  const format = row.format as QuestionType;
  let correctIndex: number | undefined;
  let correctAnswer: string | undefined;

  if ((format === "mcq" || format === "true_false") && options) {
    // answer is stored as "A", "B", etc. or "True"/"False"
    const idx = answerLetters.indexOf(row.answer);
    correctIndex = idx >= 0 ? idx : options.indexOf(row.answer);
    if (correctIndex < 0) correctIndex = 0;
  } else {
    correctAnswer = row.answer || "";
  }

  return {
    id: row.item_code,
    dbId: row.id,
    question: row.content_text,
    type: format,
    topic: row.topic || "",
    difficulty: estimateToDifficulty(Number(row.difficulty_estimate)),
    options: options || undefined,
    correctIndex,
    correctAnswer,
    explanation: row.explanation || "",
    approved: true,
    itemId: row.item_code,
    difficultyEstimate: Number(row.difficulty_estimate),
    bloomLevel: row.bloom_level,
    bloomJustification: row.bloom_justification || "",
    difficultyJustification: row.difficulty_justification || "",
    isDistractor: row.is_distractor,
    conceptId: row.concept_id || undefined,
    inTest: row.in_test ?? false,
  };
}

function questionToDbRow(q: DiagnosticQuestion, courseId: string, teacherId: string) {
  let answer: string;
  if ((q.type === "mcq" || q.type === "true_false") && q.correctIndex !== undefined) {
    answer = answerLetters[q.correctIndex] || "A";
  } else {
    answer = q.correctAnswer || "";
  }

  return {
    item_code: q.itemId,
    content_text: q.question,
    format: q.type,
    answer,
    difficulty_estimate: q.difficultyEstimate,
    bloom_level: q.bloomLevel,
    bloom_justification: q.bloomJustification || null,
    difficulty_justification: q.difficultyJustification || null,
    is_distractor: q.isDistractor,
    options: q.options || null,
    explanation: q.explanation || null,
    topic: q.topic || null,
    course_id: courseId,
    teacher_id: teacherId,
    concept_id: q.conceptId || null,
    in_test: q.inTest,
  };
}

const DiagnosticQuestionsSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DiagnosticQuestion | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; title: string; dbId?: string } | null>(null);
  const [approveAllConfirm, setApproveAllConfirm] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  const courseId = localStorage.getItem("currentCourseId");

  // Fetch questions from DB on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) {
        setLoading(false);
        return;
      }

      // Fetch questions and concepts in parallel
      const [questionsRes, conceptsRes] = await Promise.all([
        supabase
          .from("diagnostic_questions")
          .select("*")
          .eq("course_id", courseId)
          .order("created_at", { ascending: true }),
        supabase
          .from("concepts")
          .select("id, concept_code, weight")
          .eq("course_id", courseId)
          .order("concept_code", { ascending: true }),
      ]);

      if (questionsRes.error) {
        toast({ title: "Failed to load questions", description: questionsRes.error.message, variant: "destructive" });
      } else if (questionsRes.data) {
        setQuestions(questionsRes.data.map(dbRowToQuestion));
      }

      if (conceptsRes.data) {
        setConcepts(conceptsRes.data);
      }

      setLoading(false);
    };
    fetchData();
  }, [courseId]);

  const approvedCount = questions.filter((q) => q.approved).length;
  const allApproved = questions.length > 0 && approvedCount === questions.length;
  const inTestCount = questions.filter((q) => q.inTest).length;

  const toggleInTest = async (q: DiagnosticQuestion) => {
    const newVal = !q.inTest;
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, inTest: newVal } : x));
    if (q.dbId) {
      await supabase.from("diagnostic_questions").update({ in_test: newVal }).eq("id", q.dbId);
    }
  };

  const bulkSetInTest = async (value: boolean) => {
    setQuestions((prev) => prev.map((q) => ({ ...q, inTest: value })));
    if (courseId) {
      await supabase.from("diagnostic_questions").update({ in_test: value }).eq("course_id", courseId);
    }
    toast({ title: value ? "All questions added to test" : "All questions removed from test" });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleApprove = (id: string) => {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, approved: !q.approved } : q));
  };

  const startEdit = (q: DiagnosticQuestion) => {
    setEditingId(q.id);
    setEditDraft({ ...q, options: q.options ? [...q.options] : undefined });
    setMetadataOpen(false);
    if (!expandedIds.includes(q.id)) setExpandedIds((prev) => [...prev, q.id]);
  };

  const saveEdit = async () => {
    if (!editDraft || !editingId || !courseId || !user) return;
    if (!editDraft.question.trim()) {
      toast({ title: "Question text is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const row = questionToDbRow(editDraft, courseId, user.id);

    if (editDraft.dbId) {
      // Update existing
      const { error } = await supabase
        .from("diagnostic_questions")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", editDraft.dbId);
      if (error) {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      // Insert new
      const { data, error } = await supabase
        .from("diagnostic_questions")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      editDraft.dbId = data.id;
    }

    setQuestions((prev) => prev.map((q) => q.id === editingId ? { ...editDraft } : q));
    setEditingId(null);
    setEditDraft(null);
    setMetadataOpen(false);
    setSaving(false);
    toast({ title: "Question saved" });
  };

  const cancelEdit = () => {
    // If it was a new unsaved question (no dbId), remove it
    if (editDraft && !editDraft.dbId) {
      setQuestions((prev) => prev.filter((q) => q.id !== editingId));
    }
    setEditingId(null);
    setEditDraft(null);
    setMetadataOpen(false);
  };

  const confirmRemove = (q: DiagnosticQuestion) => {
    setRemoveConfirm({ id: q.id, title: q.question.slice(0, 60) || "Untitled question", dbId: q.dbId });
  };

  const executeRemove = async () => {
    if (!removeConfirm) return;
    if (removeConfirm.dbId) {
      const { error } = await supabase.from("diagnostic_questions").delete().eq("id", removeConfirm.dbId);
      if (error) {
        toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
        setRemoveConfirm(null);
        return;
      }
    }
    setQuestions((prev) => prev.filter((q) => q.id !== removeConfirm.id));
    setRemoveConfirm(null);
    toast({ title: "Question removed" });
  };

  const addQuestion = (type: QuestionType) => {
    const newQ = emptyQuestion(type, questions.length);
    setQuestions((prev) => [...prev, newQ]);
    setExpandedIds((prev) => [...prev, newQ.id]);
    startEdit(newQ);
  };

  const approveAll = () => {
    setQuestions((prev) => prev.map((q) => ({ ...q, approved: true })));
    setApproveAllConfirm(false);
    toast({ title: "All questions approved" });
  };

  const handleContinue = () => {
    navigate("/teacher/setup/settings");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading diagnostic questions…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={5} />
        <div className="mb-6 text-center">
          <h1 className="font-heading text-3xl font-bold">Student Diagnostic Questions</h1>
          <p className="text-muted-foreground">Review and customize the diagnostic quiz students will take when they join your course</p>
        </div>

        {/* Info banner */}
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works</p>
            <p>These questions are auto-generated from your uploaded course materials. You can approve, edit, delete, or add entirely new questions. The diagnostic uses adaptive testing — difficulty adjusts based on student responses.</p>
            <p className="mt-1">You can revisit and edit these questions anytime before students receive access to your course.</p>
          </div>
        </div>

        {/* Summary bar */}
        <div className="mb-4 flex flex-col gap-2 rounded-lg border px-4 py-2.5 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm">
                <span className="font-medium">{approvedCount}</span> of {questions.length} questions approved
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!allApproved && questions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setApproveAllConfirm(true)}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Approve All
                </Button>
              )}
              {allApproved && (
                <Badge className="bg-primary text-primary-foreground">
                  <Check className="mr-1 h-3 w-3" /> All Approved
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm">
              <span className="font-medium">{inTestCount}</span> of {questions.length} questions in diagnostic test
            </span>
            <div className="flex items-center gap-2">
              {inTestCount < questions.length && questions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => bulkSetInTest(true)}>
                  Add All to Test
                </Button>
              )}
              {inTestCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => bulkSetInTest(false)}>
                  Remove All from Test
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {questions.length === 0 && (
          <div className="mb-6 rounded-lg border border-dashed border-muted-foreground/30 py-12 text-center">
            <Brain className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No questions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click the buttons below to add your first diagnostic question.</p>
          </div>
        )}

        {/* Questions list */}
        <div className="space-y-2 mb-6">
          {questions.map((q, idx) => {
            const isExpanded = expandedIds.includes(q.id);
            const isEditing = editingId === q.id;

            return (
              <Card key={q.id} className={`${q.approved ? "border-primary/30" : ""} ${q.inTest ? "ring-1 ring-primary/20" : ""}`}>
                <div
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${q.approved ? "bg-primary/5" : ""}`}
                  onClick={() => !isEditing && toggleExpand(q.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">Q{idx + 1}</span>
                    <span className="text-sm truncate">{q.question || "New question..."}</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {q.inTest && (
                      <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">In Test</Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${questionTypeColors[q.type]}`}>
                      {questionTypeLabels[q.type]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                    {q.isDistractor && <AlertTriangle className="h-3 w-3 text-muted-foreground" />}
                    {q.approved && <Check className="h-3.5 w-3.5 text-primary" />}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <CardContent className="pt-0 pb-4 space-y-3">
                        {isEditing && editDraft ? (
                          /* Edit mode */
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Question Type</Label>
                              <Select value={editDraft.type} onValueChange={(v: QuestionType) => {
                                const newDraft = { ...editDraft, type: v };
                                if (v === "mcq") {
                                  newDraft.options = ["", "", "", ""];
                                  newDraft.correctIndex = 0;
                                  newDraft.correctAnswer = undefined;
                                } else if (v === "true_false") {
                                  newDraft.options = ["True", "False"];
                                  newDraft.correctIndex = 0;
                                  newDraft.correctAnswer = undefined;
                                } else {
                                  newDraft.options = undefined;
                                  newDraft.correctIndex = undefined;
                                  newDraft.correctAnswer = "";
                                }
                                setEditDraft(newDraft);
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mcq">Multiple Choice</SelectItem>
                                  <SelectItem value="true_false">True / False</SelectItem>
                                  <SelectItem value="short_answer">Short Answer</SelectItem>
                                  <SelectItem value="code">Code</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Question Text</Label>
                              <textarea
                                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={editDraft.question}
                                onChange={(e) => setEditDraft({ ...editDraft, question: e.target.value })}
                                placeholder="Enter question text..."
                              />
                            </div>

                            {/* Concept + Topic row */}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Concept</Label>
                                <Select
                                  value={editDraft.conceptId || "__none__"}
                                  onValueChange={(v) => {
                                    const selectedConcept = concepts.find((c) => c.id === v);
                                    setEditDraft({
                                      ...editDraft,
                                      conceptId: v === "__none__" ? undefined : v,
                                      topic: selectedConcept ? selectedConcept.concept_code : editDraft.topic,
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select concept…" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">— None —</SelectItem>
                                    {concepts.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.concept_code} <span className="text-muted-foreground ml-1">(w: {c.weight})</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {concepts.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground">No concepts defined for this course yet</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Topic</Label>
                                <Input className="h-8 text-xs" value={editDraft.topic} onChange={(e) => setEditDraft({ ...editDraft, topic: e.target.value })} placeholder="e.g. Variables & Data Types" />
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Difficulty Label</Label>
                                <Select value={editDraft.difficulty} onValueChange={(v: "Easy" | "Medium" | "Hard") => setEditDraft({ ...editDraft, difficulty: v, difficultyEstimate: difficultyToEstimate(v) })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Easy">Easy</SelectItem>
                                    <SelectItem value="Medium">Medium</SelectItem>
                                    <SelectItem value="Hard">Hard</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* MCQ options */}
                            {(editDraft.type === "mcq") && editDraft.options && (
                              <div className="space-y-1.5">
                                <Label className="text-xs">Answer Options (click radio to set correct answer)</Label>
                                {editDraft.options.map((opt, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditDraft({ ...editDraft, correctIndex: i })}
                                      className={`h-4 w-4 rounded-full border-2 shrink-0 ${editDraft.correctIndex === i ? "border-primary bg-primary" : "border-muted-foreground"}`}
                                    />
                                    <Input
                                      className="h-8 text-xs flex-1"
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...(editDraft.options || [])];
                                        newOpts[i] = e.target.value;
                                        setEditDraft({ ...editDraft, options: newOpts });
                                      }}
                                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                    />
                                    {editDraft.options!.length > 2 && (
                                      <button onClick={() => {
                                        const newOpts = editDraft.options!.filter((_, j) => j !== i);
                                        const newCorrect = editDraft.correctIndex !== undefined && editDraft.correctIndex >= newOpts.length ? newOpts.length - 1 : editDraft.correctIndex;
                                        setEditDraft({ ...editDraft, options: newOpts, correctIndex: newCorrect });
                                      }} className="text-muted-foreground hover:text-destructive">
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {editDraft.options.length < 6 && (
                                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditDraft({ ...editDraft, options: [...(editDraft.options || []), ""] })}>
                                    <Plus className="mr-1 h-3 w-3" /> Add Option
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* True/False options */}
                            {editDraft.type === "true_false" && (
                              <div className="space-y-1.5">
                                <Label className="text-xs">Correct Answer</Label>
                                <div className="flex gap-3">
                                  {["True", "False"].map((val, i) => (
                                    <button
                                      key={val}
                                      onClick={() => setEditDraft({ ...editDraft, correctIndex: i })}
                                      className={`rounded-lg border px-4 py-2 text-sm ${editDraft.correctIndex === i ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"}`}
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Short answer / Code answer */}
                            {(editDraft.type === "short_answer" || editDraft.type === "code") && (
                              <div className="space-y-1.5">
                                <Label className="text-xs">Expected Answer / Key</Label>
                                <textarea
                                  className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  value={editDraft.correctAnswer || ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, correctAnswer: e.target.value })}
                                  placeholder={editDraft.type === "code" ? "Expected code output or solution..." : "Expected answer..."}
                                />
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <Label className="text-xs">Explanation (shown after student answers)</Label>
                              <textarea
                                className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={editDraft.explanation}
                                onChange={(e) => setEditDraft({ ...editDraft, explanation: e.target.value })}
                                placeholder="Explain the correct answer..."
                              />
                            </div>

                            {/* Advanced Metadata (collapsible) */}
                            <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen}>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-xs h-7 w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
                                  <Settings2 className="h-3.5 w-3.5" />
                                  Advanced Metadata
                                  {metadataOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-2 space-y-3 rounded-lg border border-dashed border-muted-foreground/30 p-3">
                                  {/* Item ID */}
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Item ID</Label>
                                    <Input
                                      className="h-8 text-xs font-mono"
                                      value={editDraft.itemId}
                                      onChange={(e) => setEditDraft({ ...editDraft, itemId: e.target.value })}
                                      placeholder="e.g. PWIM/Python_Environment/Q001"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Hierarchical identifier for this question</p>
                                  </div>

                                  {/* Difficulty Estimate Slider */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-xs">Difficulty Estimate</Label>
                                      <span className="text-xs font-mono text-muted-foreground">{editDraft.difficultyEstimate.toFixed(2)}</span>
                                    </div>
                                    <Slider
                                      value={[editDraft.difficultyEstimate]}
                                      onValueChange={([v]) => setEditDraft({
                                        ...editDraft,
                                        difficultyEstimate: Math.round(v * 100) / 100,
                                        difficulty: estimateToDifficulty(v),
                                      })}
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      className="w-full"
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                      <span>Easy (0.0)</span>
                                      <span>Medium (0.5)</span>
                                      <span>Hard (1.0)</span>
                                    </div>
                                  </div>

                                  {/* Difficulty Justification */}
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Difficulty Justification</Label>
                                    <textarea
                                      className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      value={editDraft.difficultyJustification}
                                      onChange={(e) => setEditDraft({ ...editDraft, difficultyJustification: e.target.value })}
                                      placeholder="Why this difficulty level?"
                                    />
                                  </div>

                                  {/* Bloom Level */}
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Bloom's Taxonomy Level</Label>
                                      <Select value={String(editDraft.bloomLevel)} onValueChange={(v) => setEditDraft({ ...editDraft, bloomLevel: parseInt(v) })}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {Object.entries(bloomLabels).map(([level, label]) => (
                                            <SelectItem key={level} value={level}>{level} — {label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Bloom Justification</Label>
                                      <textarea
                                        className="flex min-h-[32px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        value={editDraft.bloomJustification}
                                        onChange={(e) => setEditDraft({ ...editDraft, bloomJustification: e.target.value })}
                                        placeholder="Why this Bloom level?"
                                      />
                                    </div>
                                  </div>

                                  {/* Is Distractor */}
                                  <div className="flex items-center gap-2 pt-1">
                                    <Checkbox
                                      id="is-distractor"
                                      checked={editDraft.isDistractor}
                                      onCheckedChange={(checked) => setEditDraft({ ...editDraft, isDistractor: !!checked })}
                                    />
                                    <Label htmlFor="is-distractor" className="text-xs cursor-pointer">
                                      Mark as distractor question
                                    </Label>
                                    <span className="text-[10px] text-muted-foreground ml-1">(used for calibration, not scored)</span>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>

                            <div className="flex items-center gap-2 pt-1">
                              <Button size="sm" onClick={saveEdit} disabled={saving}>
                                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          /* View mode */
                          <div className="space-y-2">
                            {/* Topic + difficulty + metadata badges */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(() => {
                                const concept = concepts.find((c) => c.id === q.conceptId);
                                return concept ? (
                                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">{concept.concept_code}</Badge>
                                ) : null;
                              })()}
                              {q.topic && <Badge variant="secondary" className="text-[10px]">{q.topic}</Badge>}
                              <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                              <Badge variant="outline" className="text-[10px] font-mono">{q.difficultyEstimate.toFixed(2)}</Badge>
                              <Badge variant="outline" className="text-[10px]">Bloom {q.bloomLevel}: {bloomLabels[q.bloomLevel]}</Badge>
                              {q.isDistractor && (
                                <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">
                                  <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> Distractor
                                </Badge>
                              )}
                            </div>

                            {/* Item ID */}
                            {q.itemId && (
                              <p className="text-[10px] font-mono text-muted-foreground">{q.itemId}</p>
                            )}

                            {/* Display options for MCQ / True-False */}
                            {q.options && (
                              <div className="space-y-1">
                                {q.options.map((opt, i) => (
                                  <div key={i} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${q.correctIndex === i ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}>
                                    <span className="font-mono">{String.fromCharCode(65 + i)}.</span>
                                    <span>{opt}</span>
                                    {q.correctIndex === i && <Check className="h-3 w-3 ml-auto" />}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Display expected answer for short answer / code */}
                            {q.correctAnswer && (
                              <div className="rounded-md bg-muted/50 px-3 py-2">
                                <p className="text-[10px] font-medium text-muted-foreground mb-1">Expected Answer</p>
                                <p className={`text-xs ${q.type === "code" ? "font-mono" : ""}`}>{q.correctAnswer}</p>
                              </div>
                            )}

                            {q.explanation && (
                              <div className="rounded-md bg-muted/30 px-3 py-2">
                                <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Explanation</p>
                                <p className="text-xs text-muted-foreground">{q.explanation}</p>
                              </div>
                            )}

                            {/* Justifications (if present) */}
                            {(q.bloomJustification || q.difficultyJustification) && (
                              <div className="rounded-md bg-muted/20 px-3 py-2 space-y-1">
                                {q.bloomJustification && (
                                  <p className="text-[10px] text-muted-foreground"><span className="font-medium">Bloom:</span> {q.bloomJustification}</p>
                                )}
                                {q.difficultyJustification && (
                                  <p className="text-[10px] text-muted-foreground"><span className="font-medium">Difficulty:</span> {q.difficultyJustification}</p>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-1 flex-wrap">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEdit(q)}>
                                <Pencil className="mr-1 h-3 w-3" /> Edit
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => confirmRemove(q)}>
                                <Trash2 className="mr-1 h-3 w-3" /> Remove
                              </Button>
                              <div className="flex items-center gap-2 ml-auto">
                                <div className="flex items-center gap-1.5">
                                  <Switch
                                    checked={q.inTest}
                                    onCheckedChange={() => toggleInTest(q)}
                                    className="scale-75"
                                  />
                                  <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => toggleInTest(q)}>
                                    {q.inTest ? "In Test" : "Not in Test"}
                                  </Label>
                                </div>
                                <Button
                                  size="sm"
                                  variant={q.approved ? "default" : "outline"}
                                  className="h-7 text-xs"
                                  onClick={() => toggleApprove(q.id)}
                                >
                                  {q.approved ? <><Check className="mr-1 h-3 w-3" /> Approved</> : "Approve"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>

        {/* Add question */}
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground self-center mr-1">Add question:</span>
          {(Object.entries(questionTypeLabels) as [QuestionType, string][]).map(([type, label]) => (
            <Button key={type} variant="outline" size="sm" onClick={() => addQuestion(type)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/syllabus")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleContinue} disabled={!allApproved}>
            Configure TA Settings <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        {!allApproved && questions.length > 0 && (
          <p className="text-xs text-destructive mt-2 text-right">Please approve all diagnostic questions to continue</p>
        )}
      </div>

      {/* Remove confirmation */}
      <Dialog open={!!removeConfirm} onOpenChange={() => setRemoveConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Question</DialogTitle>
            <DialogDescription>Are you sure you want to remove "{removeConfirm?.title}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={executeRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve all confirmation */}
      <Dialog open={approveAllConfirm} onOpenChange={setApproveAllConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve All Questions</DialogTitle>
            <DialogDescription>This will mark all {questions.length} diagnostic questions as approved. You can still edit individual questions afterwards.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveAllConfirm(false)}>Cancel</Button>
            <Button onClick={approveAll}>Approve All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DiagnosticQuestionsSetup;
