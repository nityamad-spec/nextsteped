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
  BarChart3, Filter,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
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

  // --- Filters ---
  const [filterConcept, setFilterConcept] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [filterBloom, setFilterBloom] = useState("all");
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (filterConcept !== "all" && q.conceptId !== filterConcept) return false;
      if (filterType !== "all" && q.type !== filterType) return false;
      if (filterDifficulty !== "all" && q.difficulty !== filterDifficulty) return false;
      if (filterBloom !== "all" && String(q.bloomLevel) !== filterBloom) return false;
      return true;
    });
  }, [questions, filterConcept, filterType, filterDifficulty, filterBloom]);

  // --- Test Composition Analysis ---
  const testAnalysis = useMemo(() => {
    const inTest = questions.filter((q) => q.inTest);
    const total = inTest.length;
    if (total === 0) return null;

    const byDifficulty: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0 };
    const byType: Record<string, number> = {};
    const byConcept: Record<string, number> = {};
    const byBloom: Record<number, number> = {};

    for (const q of inTest) {
      byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
      byType[q.type] = (byType[q.type] || 0) + 1;
      const conceptLabel = concepts.find((c) => c.id === q.conceptId)?.concept_code || "Unassigned";
      byConcept[conceptLabel] = (byConcept[conceptLabel] || 0) + 1;
      byBloom[q.bloomLevel] = (byBloom[q.bloomLevel] || 0) + 1;
    }

    return { total, byDifficulty, byType, byConcept, byBloom };
  }, [questions, concepts]);

  const toggleInTest = async (q: DiagnosticQuestion) => {
    const newVal = !q.inTest;
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, inTest: newVal } : x));
    if (q.dbId) {
      await supabase.from("diagnostic_questions").update({ in_test: newVal }).eq("id", q.dbId);
    }
  };

  const bulkSetInTest = async (value: boolean) => {
    const targetIds = filteredQuestions.map((q) => q.id);
    const targetDbIds = filteredQuestions.filter((q) => q.dbId).map((q) => q.dbId!);
    setQuestions((prev) => prev.map((q) => targetIds.includes(q.id) ? { ...q, inTest: value } : q));
    if (targetDbIds.length > 0) {
      await supabase.from("diagnostic_questions").update({ in_test: value }).in("id", targetDbIds);
    }
    toast({ title: value ? `${targetIds.length} questions added to test` : `${targetIds.length} questions removed from test` });
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
    setQuestions((prev) => [newQ, ...prev]);
    setExpandedIds((prev) => [...prev, newQ.id]);
    startEdit(newQ);
  };

  const hasActiveFilter = filterConcept !== "all" || filterType !== "all" || filterDifficulty !== "all" || filterBloom !== "all";

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
              {hasActiveFilter && (
                <span className="text-muted-foreground"> (showing {filteredQuestions.length} filtered)</span>
              )}
            </span>
            {hasActiveFilter && (
              <div className="flex items-center gap-2">
                {filteredQuestions.some((q) => !q.inTest) && filteredQuestions.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => bulkSetInTest(true)}>
                    Add Filtered to Test
                  </Button>
                )}
                {filteredQuestions.some((q) => q.inTest) && (
                  <Button variant="outline" size="sm" onClick={() => bulkSetInTest(false)}>
                    Remove Filtered from Test
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Test Composition Analysis */}
        <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen} className="mb-4">
          <Card>
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Test Composition Analysis</span>
                {testAnalysis && (
                  <Badge variant="outline" className="text-[10px]">{testAnalysis.total} questions</Badge>
                )}
              </div>
              {analysisOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                {!testAnalysis ? (
                  <p className="text-sm text-muted-foreground py-2">No questions in test yet. Toggle questions above to include them.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    {/* By Difficulty */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Difficulty</p>
                      <div className="space-y-1.5">
                        {["Easy", "Medium", "Hard"].map((d) => {
                          const count = testAnalysis.byDifficulty[d] || 0;
                          const pct = Math.round((count / testAnalysis.total) * 100);
                          return (
                            <div key={d} className="flex items-center gap-2">
                              <span className="text-xs w-14">{d}</span>
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* By Question Type */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Question Type</p>
                      <div className="space-y-1.5">
                        {(["mcq", "true_false", "short_answer", "code"] as QuestionType[]).map((t) => {
                          const count = testAnalysis.byType[t] || 0;
                          const pct = Math.round((count / testAnalysis.total) * 100);
                          return (
                            <div key={t} className="flex items-center gap-2">
                              <span className="text-xs w-24 truncate">{questionTypeLabels[t]}</span>
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* By Bloom's Level */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Bloom's Level</p>
                      <div className="space-y-1.5">
                        {[1, 2, 3, 4, 5, 6].map((bl) => {
                          const count = testAnalysis.byBloom[bl] || 0;
                          const pct = Math.round((count / testAnalysis.total) * 100);
                          return (
                            <div key={bl} className="flex items-center gap-2">
                              <span className="text-xs w-24 truncate">L{bl} {bloomLabels[bl]}</span>
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* By Concept */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Concept</p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {Object.entries(testAnalysis.byConcept).sort((a, b) => b[1] - a[1]).map(([concept, count]) => {
                          const pct = Math.round((count / testAnalysis.total) * 100);
                          const weight = concepts.find((c) => c.concept_code === concept)?.weight;
                          return (
                            <div key={concept} className="flex items-center gap-2">
                              <span className="text-xs w-24 truncate" title={concept}>{concept}</span>
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground w-20 text-right">
                                {count} ({pct}%){weight !== undefined ? ` W:${weight}` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 bg-muted/20">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filterConcept} onValueChange={setFilterConcept}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="All Concepts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Concepts</SelectItem>
              {concepts.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.concept_code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(["mcq", "true_false", "short_answer", "code"] as QuestionType[]).map((t) => (
                <SelectItem key={t} value={t}>{questionTypeLabels[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="All Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Difficulty</SelectItem>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterBloom} onValueChange={setFilterBloom}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All Bloom's" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bloom's</SelectItem>
              {[1, 2, 3, 4, 5, 6].map((bl) => (
                <SelectItem key={bl} value={String(bl)}>L{bl} {bloomLabels[bl]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filterConcept !== "all" || filterType !== "all" || filterDifficulty !== "all" || filterBloom !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterConcept("all"); setFilterType("all"); setFilterDifficulty("all"); setFilterBloom("all"); }}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Add question — always visible */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground self-center mr-1">Add question:</span>
          {(Object.entries(questionTypeLabels) as [QuestionType, string][]).map(([type, label]) => (
            <Button key={type} variant="outline" size="sm" onClick={() => addQuestion(type)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>

        {/* Empty state */}
        {questions.length === 0 && (
          <div className="mb-6 rounded-lg border border-dashed border-muted-foreground/30 py-12 text-center">
            <Brain className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No questions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click the buttons above to add your first diagnostic question.</p>
          </div>
        )}

        {!hasActiveFilter && questions.length > 0 && (
          <div className="mb-6 rounded-lg border border-dashed border-muted-foreground/30 py-12 text-center">
            <Filter className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Use the filters above to browse questions</p>
            <p className="text-xs text-muted-foreground mt-1">{questions.length} questions in the bank · {inTestCount} selected for diagnostic test</p>
          </div>
        )}

        {hasActiveFilter && filteredQuestions.length === 0 && (
          <div className="mb-6 rounded-lg border border-dashed border-muted-foreground/30 py-8 text-center">
            <Filter className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No questions match the current filters</p>
          </div>
        )}

        {/* Questions list — only when filters active */}
        {hasActiveFilter && (
          <div className="space-y-2 mb-6">
            {filteredQuestions.map((q, idx) => {
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
