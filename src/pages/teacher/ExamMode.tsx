import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTASettings } from "@/hooks/useTASettings";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
  Plus, Trash2, Filter, ClipboardCheck, Loader2, Shield,
} from "lucide-react";
import SetupModuleNav from "@/components/SetupModuleNav";
import QuestionTypeSelector from "@/components/QuestionTypeSelector";
import { bumpCacheVersion } from "@/lib/cacheVersion";

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
}

const questionEstimate = (length: number, mix: string) => {
  const total = Math.max(5, Math.round(length / 3));
  let breakdown: Record<string, number> = {};
  if (mix === "mixed") {
    breakdown = { MCQ: Math.round(total * 0.3), "True/False": Math.round(total * 0.2), "Short Answer": Math.round(total * 0.25), "Problem Solving": total - Math.round(total * 0.3) - Math.round(total * 0.2) - Math.round(total * 0.25) };
  } else if (mix === "mcq_only") {
    breakdown = { MCQ: total };
  } else if (mix === "true_false_only") {
    breakdown = { "True/False": total };
  } else if (mix === "short_answer") {
    breakdown = { "Short Answer": total };
  } else if (mix === "problem_solving") {
    breakdown = { "Problem Solving": total };
  } else if (mix === "mcq_short") {
    breakdown = { MCQ: Math.round(total * 0.5), "Short Answer": total - Math.round(total * 0.5) };
  } else if (mix === "mcq_problem") {
    breakdown = { MCQ: Math.round(total * 0.5), "Problem Solving": total - Math.round(total * 0.5) };
  }
  return { total, breakdown };
};

const ExamMode = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const { taSettings, loading, saveTASettings } = useTASettings(courseId);

  // ── Exam config state ──
  const [settings, setSettings] = useState(taSettings);
  const [examLength, setExamLength] = useState(taSettings.examTimeLimit ?? 60);
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix || "mixed");
  const [editingEstimate, setEditingEstimate] = useState(false);

  const [examApproved, setExamApproved] = useState(taSettings.examApproved ?? false);
  const [examEnabled, setExamEnabled] = useState(taSettings.examEnabled ?? false);
  const [examManualQuestions, setExamManualQuestions] = useState(taSettings.examManualQuestions ?? false);
  const [examManualCount, setExamManualCount] = useState(taSettings.examManualCount ?? 5);

  const estimate = useMemo(() => questionEstimate(examLength, examQuestionTypes), [examLength, examQuestionTypes]);
  const [customBreakdown, setCustomBreakdown] = useState<Record<string, number>>(estimate.breakdown);
  const [estimateApproved, setEstimateApproved] = useState(false);

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSettings(taSettings);
      setExamLength(taSettings.examTimeLimit ?? 60);
      setExamQuestionTypes(taSettings.examQuestionMix || "mixed");
      setExamApproved(taSettings.examApproved ?? false);
      setExamEnabled(taSettings.examEnabled ?? false);
      setExamManualQuestions(taSettings.examManualQuestions ?? false);
      setExamManualCount(taSettings.examManualCount ?? estimate.total);
    }
  }, [loading, taSettings]);

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
        setQuestions(data.map((row: any) => ({
          id: row.id, question: row.question_text, answer: row.answer, topic: row.topic,
          difficulty: row.difficulty, type: row.question_type,
          options: row.options, correctIndex: row.correct_index ?? undefined,
        })));
      }
      setQuestionsLoading(false);
    };
    fetchQuestions();
  }, [courseId]);

  const handleExamLengthChange = (v: number) => { setExamLength(v); setEstimateApproved(false); };
  const handleExamTypeChange = (v: string) => { setExamQuestionTypes(v); setEstimateApproved(false); };

  const activeBreakdown = editingEstimate ? customBreakdown : estimate.breakdown;
  const activeTotal = Object.values(activeBreakdown).reduce((s, n) => s + n, 0);

  const handleApproveEstimate = () => { if (editingEstimate) setEditingEstimate(false); setEstimateApproved(true); };
  const handleEditEstimate = () => { setCustomBreakdown({ ...estimate.breakdown }); setEditingEstimate(true); setEstimateApproved(false); };

  const canContinue = examApproved;

  const handleSave = async () => {
    try {
      await saveTASettings({
        ...settings,
        examTimeLimit: examLength,
        examQuestionMix: examQuestionTypes,
        examPresentation: "all_at_once",
        examApproved,
        examEnabled,
        examManualQuestions,
        examManualCount,
      });
    } catch {
      toast.error("Failed to save exam settings. Please try again.");
      throw new Error("save failed");
    }
  };

  // ── Custom question handlers ──
  const openAddDialog = () => {
    setEditingId(null);
    setFormQuestion(""); setFormAnswer(""); setFormTopic("");
    setFormType("MCQ"); setFormOptions(["", "", "", ""]); setFormCorrectIndex(0);
    setDialogOpen(true);
  };

  const openEditDialog = (q: EditableQuestion) => {
    setEditingId(q.id);
    setFormQuestion(q.question); setFormAnswer(q.answer || ""); setFormTopic(q.topic);
    setFormType(q.type);
    setFormOptions(q.options?.length ? [...q.options] : ["", "", "", ""]);
    setFormCorrectIndex(q.correctIndex ?? 0);
    setDialogOpen(true);
  };

  const handleSaveQuestion = async () => {
    if (!formQuestion.trim() || !formTopic || !courseId || !user) return;
    setSaving(true);
    const isMCQ = formType === "MCQ";
    const isTF = formType === "True/False";
    const filteredOptions = isMCQ ? formOptions.filter(o => o.trim()) : null;
    const answer = isMCQ ? (filteredOptions?.[formCorrectIndex] || "") : formAnswer;
    const row = {
      course_id: courseId, teacher_id: user.id, mode: "exam" as const, question_type: formType,
      question_text: formQuestion, answer, topic: formTopic, difficulty: "Medium" as const,
      options: isMCQ ? filteredOptions : isTF ? ["True", "False"] : null,
      correct_index: isMCQ ? formCorrectIndex : isTF ? (formAnswer === "True" ? 0 : 1) : null,
      explanation: null as string | null, quiz_day: null as number | null,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from("assessment_questions").update(row).eq("id", editingId);
        if (error) throw error;
        setQuestions(prev => prev.map(q => q.id === editingId ? {
          id: editingId, question: formQuestion, answer, topic: formTopic,
          difficulty: "Medium", type: formType,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
        } : q));
        toast.success("Question updated");
      } else {
        const { data, error } = await supabase.from("assessment_questions").insert(row).select("id").single();
        if (error) throw error;
        setQuestions(prev => [...prev, {
          id: data.id, question: formQuestion, answer, topic: formTopic,
          difficulty: "Medium", type: formType,
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
                <QuestionTypeSelector value={examQuestionTypes} onChange={handleExamTypeChange} />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Length (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[examLength]} onValueChange={(v) => { handleExamLengthChange(v[0]); setExamApproved(false); }} min={15} max={180} step={15} className="flex-1" />
                  <span className="w-16 text-right text-sm font-bold">{examLength} min</span>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Number of Questions</Label>
                  </div>
                  <Button
                    variant={examManualQuestions ? "default" : "outline"}
                    size="sm" className="h-7 text-xs"
                    onClick={() => { setExamManualQuestions(!examManualQuestions); setExamApproved(false); }}
                  >
                    {examManualQuestions ? "Manual" : "Estimated"}
                  </Button>
                </div>

                {examManualQuestions ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Manually define the number of questions for this exam.</p>
                    <div className="flex items-center gap-4">
                      <Slider value={[examManualCount]} onValueChange={(v) => { setExamManualCount(v[0]); setExamApproved(false); }} min={5} max={100} step={1} className="flex-1" />
                      <span className="w-16 text-right text-sm font-bold">{examManualCount}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Based on {examLength} min — estimated <span className="font-bold text-foreground">{activeTotal} questions</span>
                    </p>
                    <div className="space-y-2">
                      {Object.entries(activeBreakdown).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{type}</span>
                          {editingEstimate ? (
                            <Input type="number" min={0} className="h-7 w-16 text-xs text-right" value={count}
                              onChange={(e) => setCustomBreakdown(prev => ({ ...prev, [type]: Math.max(0, parseInt(e.target.value) || 0) }))} />
                          ) : (
                            <span className="text-sm font-bold">{count}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {!editingEstimate && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleEditEstimate}>
                          <Pencil className="mr-1 h-3 w-3" /> Edit Breakdown
                        </Button>
                      )}
                      <Button variant={estimateApproved ? "outline" : "default"} size="sm" className="h-7 text-xs" onClick={handleApproveEstimate}>
                        {estimateApproved ? <><Check className="mr-1 h-3 w-3" /> Approved</> : "Approve Estimate"}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {(() => {
                const typesSelected = examQuestionTypes && examQuestionTypes !== "mixed"
                  ? examQuestionTypes.split(",").filter(Boolean).length > 0
                  : false;
                return (
                  <div className={`flex items-center justify-between rounded-lg border p-4 ${examApproved ? "border-primary/30 bg-primary/5" : ""}`}>
                    <div>
                      <p className="text-sm font-medium">Approve Exam Rules</p>
                      <p className="text-xs text-muted-foreground">
                        {typesSelected
                          ? "You must approve exam settings before publishing"
                          : "Select at least one question type above before approving"}
                      </p>
                    </div>
                    <Button
                      variant={examApproved ? "outline" : "default"}
                      size="sm"
                      disabled={!examApproved && !typesSelected}
                      onClick={() => {
                        const next = !examApproved;
                        setExamApproved(next);
                        if (next && !examEnabled) setExamEnabled(true);
                      }}
                    >
                      {examApproved ? <><Check className="mr-1 h-4 w-4" /> Approved</> : "Approve"}
                    </Button>
                  </div>
                );
              })()}
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
                <Button size="sm" onClick={openAddDialog}><Plus className="mr-1 h-4 w-4" /> Add Question</Button>
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
                  {(["MCQ", "True/False", "Short Answer", "Code Practice"] as QuestionType[]).map(type => (
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
              <Label>Topic</Label>
              <Input value={formTopic} onChange={e => setFormTopic(e.target.value)} placeholder="e.g. Functions" />
            </div>
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={formType} onValueChange={v => setFormType(v as QuestionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCQ">Multiple Choice</SelectItem>
                  <SelectItem value="True/False">True / False</SelectItem>
                  <SelectItem value="Short Answer">Short Answer</SelectItem>
                  <SelectItem value="Code Practice">Code Practice</SelectItem>
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
    </div>
  );
};

export default ExamMode;
