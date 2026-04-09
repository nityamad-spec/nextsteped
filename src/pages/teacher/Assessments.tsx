import { useState, useEffect } from "react";
import { useTASettings } from "@/hooks/useTASettings";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, ClipboardCheck, Pencil, Trash2, Filter, Shield, BookOpen, Clock, Info, Loader2, Power, Brain } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type QuestionType = "MCQ" | "True/False" | "Short Answer" | "Code Practice";
type QuestionMode = "learning" | "exam" | "daily_quiz";

interface EditableQuestion {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  type: QuestionType;
  mode: QuestionMode;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  quizDay?: number;
}

const Assessments = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const { taSettings, loading: taLoading, saveTASettings } = useTASettings(courseId);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [examPredefinedOnly, setExamPredefinedOnly] = useState(false);
  const [filterDifficulties, setFilterDifficulties] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [formType, setFormType] = useState<QuestionType>("MCQ");
  const [formMode, setFormMode] = useState<QuestionMode>("exam");
  const [formOptions, setFormOptions] = useState<string[]>(["", "", "", ""]);
  const [formCorrectIndex, setFormCorrectIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [examTimeLimit, setExamTimeLimit] = useState(taSettings.examTimeLimit || 60);
  const [examManualQuestions, setExamManualQuestions] = useState(false);
  const [examManualCount, setExamManualCount] = useState(20);
  const [diagnosticCount, setDiagnosticCount] = useState(0);

  useEffect(() => {
    if (!taLoading) {
      setExamTimeLimit(taSettings.examTimeLimit || 60);
      setExamManualQuestions(taSettings.examManualQuestions ?? false);
      setExamManualCount(taSettings.examManualCount ?? 20);
    }
  }, [taSettings, taLoading]);

  const examEstimate = Math.max(5, Math.round(examTimeLimit / 3));

  useEffect(() => {
    if (!courseId) { setQuestionsLoading(false); return; }
    const fetchQuestions = async () => {
      setQuestionsLoading(true);
      const [{ data, error }, diagnosticRes] = await Promise.all([
        supabase.from("assessment_questions").select("*").eq("course_id", courseId),
        supabase.from("diagnostic_questions").select("id", { count: "exact" }).eq("course_id", courseId),
      ]);
      if (error) { console.error(error); toast.error("Failed to load questions"); }
      else if (data) {
        setQuestions(data.map((row: any) => ({
          id: row.id, question: row.question_text, answer: row.answer, topic: row.topic,
          difficulty: row.difficulty, type: row.question_type, mode: row.mode,
          options: row.options, correctIndex: row.correct_index ?? undefined,
          explanation: row.explanation ?? undefined, quizDay: row.quiz_day,
        })));
      }
      setDiagnosticCount(diagnosticRes.count || 0);
      setQuestionsLoading(false);
    };
    fetchQuestions();
  }, [courseId]);

  const examQuestions = questions.filter(q => q.mode === "exam");
  const clearFilters = () => { setFilterDifficulties([]); setFilterTypes([]); };

  const toggleFilterDifficulty = (diff: string) => {
    setFilterDifficulties(prev => prev.includes(diff) ? prev.filter(d => d !== diff) : [...prev, diff]);
  };
  const toggleFilterType = (type: string) => {
    setFilterTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const openAddDialog = (mode: QuestionMode) => {
    setEditingId(null);
    setFormQuestion(""); setFormAnswer(""); setFormTopic(""); setFormDifficulty("Medium");
    setFormType("MCQ"); setFormMode(mode);
    setFormOptions(["", "", "", ""]); setFormCorrectIndex(0);
    setDialogOpen(true);
  };

  const openEditDialog = (q: EditableQuestion) => {
    setEditingId(q.id);
    setFormQuestion(q.question); setFormAnswer(q.answer || ""); setFormTopic(q.topic);
    setFormDifficulty(q.difficulty); setFormType(q.type); setFormMode(q.mode);
    setFormOptions(q.options?.length ? [...q.options] : ["", "", "", ""]);
    setFormCorrectIndex(q.correctIndex ?? 0);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formQuestion.trim() || !formTopic || !courseId || !user) return;
    setSaving(true);
    const isMCQ = formType === "MCQ";
    const filteredOptions = isMCQ ? formOptions.filter(o => o.trim()) : null;
    const answer = isMCQ ? (filteredOptions?.[formCorrectIndex] || "") : formAnswer;
    const row = {
      course_id: courseId, teacher_id: user.id, mode: formMode, question_type: formType,
      question_text: formQuestion, answer, topic: formTopic, difficulty: formDifficulty,
      options: filteredOptions, correct_index: isMCQ ? formCorrectIndex : null,
      explanation: null as string | null, quiz_day: null as number | null,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from("assessment_questions").update(row).eq("id", editingId);
        if (error) throw error;
        setQuestions(prev => prev.map(q => q.id === editingId ? {
          id: editingId, question: formQuestion, answer, topic: formTopic,
          difficulty: formDifficulty, type: formType, mode: formMode,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
        } : q));
        toast.success("Question updated");
      } else {
        const { data, error } = await supabase.from("assessment_questions").insert(row).select("id").single();
        if (error) throw error;
        setQuestions(prev => [...prev, {
          id: data.id, question: formQuestion, answer, topic: formTopic,
          difficulty: formDifficulty, type: formType, mode: formMode,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
        }]);
        toast.success("Question added");
      }
      setDialogOpen(false);
    } catch (err: any) { toast.error("Failed to save question"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("assessment_questions").delete().eq("id", id);
    if (error) { toast.error("Failed to delete question"); return; }
    setQuestions(prev => prev.filter(q => q.id !== id));
    toast.success("Question deleted");
  };

  const updateOption = (index: number, value: string) => {
    setFormOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const handleSaveExamSettings = async () => {
    try {
      await saveTASettings({ ...taSettings, examTimeLimit });
      toast.success("Exam settings saved");
    } catch { toast.error("Failed to save exam settings"); }
  };

  const filterQuestions = (list: EditableQuestion[]) => {
    return list.filter(q => {
      if (filterDifficulties.length > 0 && !filterDifficulties.includes(q.difficulty)) return false;
      if (filterTypes.length > 0 && !filterTypes.includes(q.type)) return false;
      return true;
    });
  };

  const typeBadgeColor = (type: QuestionType) => {
    switch (type) {
      case "MCQ": return "bg-primary/10 text-primary";
      case "Short Answer": return "bg-warning/10 text-warning";
      case "Code Practice": return "bg-accent/10 text-accent";
    }
  };

  const renderQuestionCard = (q: EditableQuestion) => (
    <div key={q.id} className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={q.difficulty === "Easy" ? "secondary" : q.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">{q.difficulty}</Badge>
          <Badge variant="outline" className={`text-[10px] ${typeBadgeColor(q.type)}`}>{q.type}</Badge>
          <span className="text-xs text-muted-foreground">{q.topic}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openEditDialog(q)} className="rounded p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
          <button onClick={() => handleDelete(q.id)} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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
      {q.type !== "MCQ" && q.answer && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Answer:</span> {q.answer}</p>
        </div>
      )}
    </div>
  );

  const renderFilterBar = () => (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filters</span>
        {(filterDifficulties.length > 0 || filterTypes.length > 0) && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={clearFilters}>Clear all</Button>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Difficulty</Label>
        <div className="flex flex-wrap gap-2">
          {["Easy", "Medium", "Hard"].map(diff => (
            <button key={diff} onClick={() => toggleFilterDifficulty(diff)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${filterDifficulties.includes(diff) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
              {diff}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <div className="flex flex-wrap gap-2">
          {(["MCQ", "Short Answer", "Code Practice"] as QuestionType[]).map(type => (
            <button key={type} onClick={() => toggleFilterType(type)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${filterTypes.includes(type) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (questionsLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Assessments</h1>
        <p className="text-muted-foreground">Manage exam questions and view diagnostic structure</p>
      </div>

      <Tabs defaultValue="exam" className="space-y-4" onValueChange={() => clearFilters()}>
        <TabsList>
          <TabsTrigger value="exam" className="gap-2"><Shield className="h-4 w-4" /> Exam Mode</TabsTrigger>
          <TabsTrigger value="diagnostic" className="gap-2"><Brain className="h-4 w-4" /> Diagnostic</TabsTrigger>
        </TabsList>

        {/* ─── EXAM TAB ─── */}
        <TabsContent value="exam" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Shield className="h-5 w-5" /></div>
                <div><CardTitle className="text-base">Exam Settings</CardTitle><CardDescription>Control how the final exam is presented to students</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Time Limit (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[examTimeLimit]} onValueChange={v => setExamTimeLimit(v[0])} min={15} max={180} step={15} className="flex-1" />
                  <span className="w-16 text-right text-sm font-bold">{examTimeLimit} min</span>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><Label className="text-sm font-medium">Number of Questions</Label></div>
                  <Button variant={examManualQuestions ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setExamManualQuestions(!examManualQuestions)}>
                    {examManualQuestions ? "Manual" : "Estimated"}
                  </Button>
                </div>
                {examManualQuestions ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Manually define the number of questions.</p>
                    <div className="flex items-center gap-4">
                      <Slider value={[examManualCount]} onValueChange={v => setExamManualCount(v[0])} min={5} max={100} step={1} className="flex-1" />
                      <span className="w-16 text-right text-sm font-bold">{examManualCount}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Based on {examTimeLimit} min — estimated <span className="font-bold text-foreground">{examEstimate} questions</span></p>
                )}
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Question Types</Label>
                <Select value={taSettings.examQuestionMix} onValueChange={v => saveTASettings({ ...taSettings, examQuestionMix: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed (MCQ + Short Answer + Problem Solving)</SelectItem>
                    <SelectItem value="mcq_only">Multiple Choice Only</SelectItem>
                    <SelectItem value="short_answer">Short Answer Only</SelectItem>
                    <SelectItem value="problem_solving">Problem Solving Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Difficulty</Label>
                <Select value={taSettings.examDifficulty} onValueChange={(v: any) => saveTASettings({ ...taSettings, examDifficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                    <SelectItem value="Mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveExamSettings} className="w-full">Save Exam Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5" /> Exam Questions</CardTitle>
                  <CardDescription>Add any custom questions you want visible to students during the exam. These are exclusive to exam mode.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openAddDialog("exam")}><Plus className="mr-1 h-4 w-4" /> Add Question</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderFilterBar()}
              <p className="text-xs text-muted-foreground">
                Showing <strong className="text-foreground">{filterQuestions(examQuestions).length}</strong> of {examQuestions.length} exam questions
              </p>
              <div className="space-y-3">
                {filterQuestions(examQuestions).length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">No exam questions yet. Add your first question above.</p>
                  </div>
                ) : filterQuestions(examQuestions).map(renderQuestionCard)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DIAGNOSTIC TAB ─── */}
        <TabsContent value="diagnostic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="h-5 w-5 text-primary" /> Diagnostic Structure
              </CardTitle>
              <CardDescription>How the adaptive diagnostic assessment works</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted font-bold text-sm">5</div>
                    <p className="text-sm font-semibold">Standard Questions</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Same for all students at medium difficulty. Establishes a baseline understanding of core concepts.</p>
                  <div className="rounded-lg border bg-muted/30 p-3 mt-2">
                    <p className="text-xs text-muted-foreground italic">"What is the output of: print(type(3.14))?"</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">MCQ</Badge>
                      <Badge variant="outline" className="text-[10px]">Medium</Badge>
                      <span className="text-[10px] text-muted-foreground">Data Types</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted font-bold text-sm">5</div>
                    <p className="text-sm font-semibold">Adaptive Questions</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Adapt based on standard question performance. Students are routed to Easy, Medium, or Hard tier.</p>
                  <div className="rounded-lg border bg-muted/30 p-3 mt-2">
                    <p className="text-xs text-muted-foreground italic">"Write a function that returns the sum of all even numbers in a list."</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">Short Answer</Badge>
                      <Badge variant="outline" className="text-[10px]">Varies</Badge>
                      <span className="text-[10px] text-muted-foreground">Functions</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">All questions are randomized per student using a seeded shuffle algorithm.</p>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-medium">{diagnosticCount} questions in the question bank</p>
                  <p className="text-xs text-muted-foreground">AI-generated and randomized per student. Edit from the setup flow.</p>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Concept Coverage</p>
                <div className="flex flex-wrap gap-2">
                  {["Variables & Types", "Control Flow", "Functions", "Lists & Dicts", "File Handling", "OOP Basics", "Error Handling"].map(concept => (
                    <Badge key={concept} variant="outline" className="text-xs">{concept}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Questions are distributed across all major course concepts.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Input value={formTopic} onChange={e => setFormTopic(e.target.value)} placeholder="e.g. Functions" />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={formDifficulty} onValueChange={v => setFormDifficulty(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={formType} onValueChange={v => setFormType(v as QuestionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCQ">Multiple Choice</SelectItem>
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
            ) : (
              <div className="space-y-2">
                <Label>Answer</Label>
                <Textarea value={formAnswer} onChange={e => setFormAnswer(e.target.value)} placeholder="Expected answer..." rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formQuestion.trim() || !formTopic}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? "Update" : "Add"} Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assessments;
