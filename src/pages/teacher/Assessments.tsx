import { useState, useEffect } from "react";
import { useTASettings } from "@/hooks/useTASettings";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, ClipboardCheck, Pencil, Trash2, Filter, Shield, BookOpen, Clock, ClipboardList, Info, Calendar, AlertTriangle, Loader2, Power } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Course } from "@/types";

type QuestionType = "MCQ" | "Short Answer" | "Code Practice";
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
  const { currentCourse, setCurrentCourse } = useApp();
  const { user } = useAuth();
  const courseId = currentCourse?.id || localStorage.getItem("currentCourseId");

  // Auto-recover course if context is empty
  useEffect(() => {
    if (currentCourse || !user) return;
    (async () => {
      let { data } = await supabase.from("courses").select("id, name, course_code").eq("teacher_id", user.id).limit(1).maybeSingle();
      if (!data) {
        const { data: m } = await supabase.from("course_teachers").select("course_id").eq("teacher_id", user.id).limit(1).maybeSingle();
        if (m?.course_id) ({ data } = await supabase.from("courses").select("id, name, course_code").eq("id", m.course_id).maybeSingle());
      }
      if (data) setCurrentCourse({ id: data.id, name: data.name } as Course);
    })();
  }, [currentCourse, user, setCurrentCourse]);

  const { taSettings, loading: taLoading, saveTASettings } = useTASettings(courseId);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [examPredefinedOnly, setExamPredefinedOnly] = useState(false);

  // Filters (per-section)
  const [filterDifficulties, setFilterDifficulties] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterDays, setFilterDays] = useState<number[]>([]);

  // Dialog state
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
  const [formQuizDay, setFormQuizDay] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  // Exam settings
  const [examTimeLimit, setExamTimeLimit] = useState(taSettings.examTimeLimit || 60);
  const [examManualQuestions, setExamManualQuestions] = useState(false);
  const [examManualCount, setExamManualCount] = useState(20);

  // Daily quiz settings
  const [quizNumQuestions, setQuizNumQuestions] = useState(taSettings.quizNumQuestions || 5);
  const [quizQuestionTypes, setQuizQuestionTypes] = useState(taSettings.quizQuestionMix || "mixed");
  const [quizTimeLimit, setQuizTimeLimit] = useState(taSettings.quizTimeLimit || 10);

  // Sync local state when DB settings arrive
  useEffect(() => {
    if (!taLoading) {
      setExamTimeLimit(taSettings.examTimeLimit || 60);
      setExamManualQuestions(taSettings.examManualQuestions ?? false);
      setExamManualCount(taSettings.examManualCount ?? 20);
      setQuizNumQuestions(taSettings.quizNumQuestions || 5);
      setQuizQuestionTypes(taSettings.quizQuestionMix || "mixed");
      setQuizTimeLimit(taSettings.quizTimeLimit || 10);
    }
  }, [taSettings, taLoading]);

  const examEstimate = Math.max(5, Math.round(examTimeLimit / 3));

  // Fetch questions from DB
  useEffect(() => {
    if (!courseId) { setQuestionsLoading(false); return; }
    const fetchQuestions = async () => {
      setQuestionsLoading(true);
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("*")
        .eq("course_id", courseId);

      if (error) {
        console.error("Error fetching questions:", error);
        toast.error("Failed to load questions");
      } else if (data) {
        setQuestions(data.map((row: any) => ({
          id: row.id,
          question: row.question_text,
          answer: row.answer,
          topic: row.topic,
          difficulty: row.difficulty as "Easy" | "Medium" | "Hard",
          type: row.question_type as QuestionType,
          mode: row.mode as QuestionMode,
          options: row.options as string[] | undefined,
          correctIndex: row.correct_index ?? undefined,
          explanation: row.explanation ?? undefined,
          quizDay: row.quiz_day as number | undefined,
        })));
      }
      setQuestionsLoading(false);
    };
    fetchQuestions();
  }, [courseId]);

  // Derived counts
  const examQuestions = questions.filter(q => q.mode === "exam");
  const quizQuestions = questions.filter(q => q.mode === "daily_quiz");
  const studyQuestions = questions.filter(q => q.mode === "learning");
  const uniqueQuizDays = [...new Set(quizQuestions.map(q => q.quizDay).filter((d): d is number => d != null))].sort((a, b) => a - b);
  const questionsByDay = (day: number) => quizQuestions.filter(q => q.quizDay === day);

  const clearFilters = () => { setFilterDifficulties([]); setFilterTypes([]); setFilterDays([]); };

  const toggleFilterDifficulty = (diff: string) => {
    setFilterDifficulties((prev) => prev.includes(diff) ? prev.filter((d) => d !== diff) : [...prev, diff]);
  };
  const toggleFilterType = (type: string) => {
    setFilterTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);
  };
  const toggleFilterDay = (day: number) => {
    setFilterDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const openAddDialog = (mode: QuestionMode) => {
    setEditingId(null);
    setFormQuestion(""); setFormAnswer(""); setFormTopic(""); setFormDifficulty("Medium");
    setFormType("MCQ"); setFormMode(mode);
    setFormOptions(["", "", "", ""]); setFormCorrectIndex(0); setFormQuizDay(1);
    setDialogOpen(true);
  };

  const openEditDialog = (q: EditableQuestion) => {
    setEditingId(q.id);
    setFormQuestion(q.question); setFormAnswer(q.answer || ""); setFormTopic(q.topic);
    setFormDifficulty(q.difficulty); setFormType(q.type); setFormMode(q.mode);
    setFormOptions(q.options?.length ? [...q.options] : ["", "", "", ""]);
    setFormCorrectIndex(q.correctIndex ?? 0); setFormQuizDay(q.quizDay ?? 1);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formQuestion.trim() || !formTopic || !courseId || !user) return;
    setSaving(true);
    const isMCQ = formType === "MCQ";
    const filteredOptions = isMCQ ? formOptions.filter(o => o.trim()) : null;
    const answer = isMCQ ? (filteredOptions?.[formCorrectIndex] || "") : formAnswer;

    const row = {
      course_id: courseId,
      teacher_id: user.id,
      mode: formMode,
      question_type: formType,
      question_text: formQuestion,
      answer,
      topic: formTopic,
      difficulty: formDifficulty,
      options: filteredOptions,
      correct_index: isMCQ ? formCorrectIndex : null,
      explanation: null as string | null,
      quiz_day: formMode === "daily_quiz" ? formQuizDay : null,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("assessment_questions")
          .update(row)
          .eq("id", editingId);
        if (error) throw error;
        setQuestions(prev => prev.map(q => q.id === editingId ? {
          id: editingId,
          question: formQuestion,
          answer,
          topic: formTopic,
          difficulty: formDifficulty,
          type: formType,
          mode: formMode,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
          ...(formMode === "daily_quiz" ? { quizDay: formQuizDay } : {}),
        } : q));
        toast.success("Question updated");
      } else {
        const { data, error } = await supabase
          .from("assessment_questions")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;
        const newQ: EditableQuestion = {
          id: data.id,
          question: formQuestion,
          answer,
          topic: formTopic,
          difficulty: formDifficulty,
          type: formType,
          mode: formMode,
          ...(isMCQ ? { options: filteredOptions!, correctIndex: formCorrectIndex } : {}),
          ...(formMode === "daily_quiz" ? { quizDay: formQuizDay } : {}),
        };
        setQuestions(prev => [...prev, newQ]);
        toast.success("Question added");
      }
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("assessment_questions")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete question");
      return;
    }
    setQuestions(prev => prev.filter(q => q.id !== id));
    toast.success("Question deleted");
  };

  const updateOption = (index: number, value: string) => {
    setFormOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const handleSaveQuizSettings = async () => {
    try {
      await saveTASettings({ ...taSettings, quizNumQuestions, quizQuestionMix: quizQuestionTypes, quizTimeLimit });
      toast.success("Quiz settings saved");
    } catch { toast.error("Failed to save quiz settings"); }
  };

  const handleSaveExamSettings = async () => {
    try {
      await saveTASettings({ ...taSettings, examTimeLimit });
      toast.success("Exam settings saved");
    } catch { toast.error("Failed to save exam settings"); }
  };

  const filterQuestions = (list: EditableQuestion[], includeDay = false) => {
    return list.filter((q) => {
      if (filterDifficulties.length > 0 && !filterDifficulties.includes(q.difficulty)) return false;
      if (filterTypes.length > 0 && !filterTypes.includes(q.type)) return false;
      if (includeDay && filterDays.length > 0 && (!q.quizDay || !filterDays.includes(q.quizDay))) return false;
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

  const modeLabel = (mode: QuestionMode) => {
    switch (mode) {
      case "learning": return "Study Mode";
      case "exam": return "Exam Mode";
      case "daily_quiz": return "Daily Quiz";
    }
  };

  const renderQuestionCard = (q: EditableQuestion) => (
    <div key={q.id} className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={q.difficulty === "Easy" ? "secondary" : q.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
            {q.difficulty}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${typeBadgeColor(q.type)}`}>{q.type}</Badge>
          {q.mode === "daily_quiz" && q.quizDay && (
            <Badge variant="outline" className="text-[10px] bg-secondary/50 text-secondary-foreground">
              <Calendar className="h-2.5 w-2.5 mr-1" />
              Day {q.quizDay}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{q.topic}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openEditDialog(q)} className="rounded p-1.5 hover:bg-muted">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => handleDelete(q.id)} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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

  const renderFilterBar = (showDayFilter = false) => (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filters</span>
        {(filterDifficulties.length > 0 || filterTypes.length > 0 || filterDays.length > 0) && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={clearFilters}>Clear all</Button>
        )}
      </div>
      {showDayFilter && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quiz Day</Label>
          <div className="flex flex-wrap gap-2">
            {uniqueQuizDays.map((day) => (
              <button key={day} onClick={() => toggleFilterDay(day)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${filterDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
                Day {day}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Difficulty</Label>
        <div className="flex flex-wrap gap-2">
          {["Easy", "Medium", "Hard"].map((diff) => (
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
          {(["MCQ", "Short Answer", "Code Practice"] as QuestionType[]).map((type) => (
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
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Assessments</h1>
        <p className="text-muted-foreground">Manage questions separately for each mode — no overlap between Exam, Daily Quiz, and Study</p>
      </div>

      {/* No-overlap callout */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">No question overlap:</strong> Each question belongs to exactly <strong>one</strong> mode. Exam questions will never appear in Daily Quizzes or Study Mode, and vice versa. This ensures fair, non-repetitive assessments across all modes.</p>
        </div>
      </div>

      {/* Main tabs: Exam / Daily Quiz / Study — each with settings + questions */}
      <Tabs defaultValue="exam" className="space-y-4" onValueChange={() => clearFilters()}>
        <TabsList>
          <TabsTrigger value="exam" className="gap-2"><Shield className="h-4 w-4" /> Exam Mode</TabsTrigger>
          <TabsTrigger value="quiz" className="gap-2"><ClipboardList className="h-4 w-4" /> Daily Quiz</TabsTrigger>
          <TabsTrigger value="study" className="gap-2"><BookOpen className="h-4 w-4" /> Study Mode</TabsTrigger>
        </TabsList>

        {/* ─── EXAM TAB ─── */}
        <TabsContent value="exam" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Shield className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-base">Exam Settings</CardTitle>
                  <CardDescription>Control how the final exam is presented to students</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Use predefined questions only</p>
                  <p className="text-xs text-muted-foreground">Only show your custom exam questions — no auto-generated questions.</p>
                </div>
                <Switch checked={examPredefinedOnly} onCheckedChange={setExamPredefinedOnly} />
              </div>
              {examPredefinedOnly && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground"><strong className="text-foreground">{examQuestions.length}</strong> exam-only questions will be used.</p>
                </div>
              )}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Time Limit (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[examTimeLimit]} onValueChange={(v) => setExamTimeLimit(v[0])} min={15} max={180} step={15} className="flex-1" />
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
                      <Slider value={[examManualCount]} onValueChange={(v) => setExamManualCount(v[0])} min={5} max={100} step={1} className="flex-1" />
                      <span className="w-16 text-right text-sm font-bold">{examManualCount}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Based on {examTimeLimit} min — estimated <span className="font-bold text-foreground">{examEstimate} questions</span></p>
                )}
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Question Types</Label>
                <Select value={taSettings.examQuestionMix} onValueChange={(v) => saveTASettings({ ...taSettings, examQuestionMix: v })}>
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

              {/* Enable/Disable Toggle */}
              <div className={`flex items-center justify-between rounded-lg border p-4 mt-4 ${taSettings.examEnabled ? "border-primary/30 bg-primary/5" : "border-dashed"}`}>
                <div className="flex items-center gap-3">
                  <Power className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Available to Students</p>
                    <p className="text-xs text-muted-foreground">
                      {taSettings.examApproved
                        ? "Toggle to enable or disable student access to the exam"
                        : "Approve exam rules in setup first"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={taSettings.examEnabled}
                  disabled={!taSettings.examApproved}
                  onCheckedChange={async (checked) => {
                    try {
                      await saveTASettings({ ...taSettings, examEnabled: checked });
                      toast.success(`Exam ${checked ? "enabled" : "disabled"} for students`);
                    } catch {
                      toast.error("Failed to update exam availability");
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Exam Questions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5" /> Exam Questions</CardTitle>
                  <CardDescription>These questions are exclusive to exam mode and will never appear in daily quizzes or study mode.</CardDescription>
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

        {/* ─── DAILY QUIZ TAB ─── */}
        <TabsContent value="quiz" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-base">Daily Quiz Settings</CardTitle>
                  <CardDescription>Configure daily quiz parameters for students</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                   <p><strong className="text-foreground">Standardized daily quizzes:</strong> All students receive the <strong>same</strong> set of questions for each day. Assign any day number to each question.</p>
                   <p>These questions are exclusive to daily quizzes and will never appear in exam or study mode.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {uniqueQuizDays.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-center w-full">
                    <p className="text-xs text-muted-foreground">No quiz days yet. Add questions with a day assignment below.</p>
                  </div>
                ) : uniqueQuizDays.map((day) => (
                  <div key={day} className="rounded-lg border p-3 text-center min-w-[100px]">
                    <p className="text-lg font-bold text-primary">{questionsByDay(day).length}</p>
                    <p className="text-xs text-muted-foreground">Day {day} Questions</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Questions Per Quiz</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[quizNumQuestions]} onValueChange={(v) => setQuizNumQuestions(v[0])} min={3} max={20} step={1} className="flex-1" />
                  <span className="w-16 text-right text-sm font-bold">{quizNumQuestions}</span>
                </div>
                <p className="text-xs text-muted-foreground">If fewer questions are tagged for a day than this number, all available questions for that day will be used.</p>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Time Limit (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[quizTimeLimit]} onValueChange={(v) => setQuizTimeLimit(v[0])} min={5} max={30} step={5} className="flex-1" />
                  <span className="w-16 text-right text-sm font-bold">{quizTimeLimit} min</span>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Question Types</Label>
                <Select value={quizQuestionTypes} onValueChange={setQuizQuestionTypes}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed (MCQ + Short Answer)</SelectItem>
                    <SelectItem value="mcq_only">Multiple Choice Only</SelectItem>
                    <SelectItem value="short_answer">Short Answer Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveQuizSettings} className="w-full">Save Quiz Settings</Button>

              {/* Per-Day Enable/Disable Toggles */}
              <div className="space-y-3 mt-4">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Power className="h-4 w-4 text-primary" />
                  Available to Students
                </Label>
                {!taSettings.quizApproved && (
                  <p className="text-xs text-muted-foreground">Approve quiz rules in setup first to enable toggles.</p>
                )}
                {uniqueQuizDays.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Add quiz questions with day assignments to see toggles here.</p>
                ) : uniqueQuizDays.map((day) => {
                  const enabled = (taSettings.quizDaysEnabled || []).includes(day);
                  return (
                    <div key={day} className={`flex items-center justify-between rounded-lg border p-4 ${enabled ? "border-primary/30 bg-primary/5" : "border-dashed"}`}>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">Day {day} Quiz</p>
                          <p className="text-xs text-muted-foreground">{questionsByDay(day).length} question{questionsByDay(day).length !== 1 ? "s" : ""} tagged</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={!taSettings.quizApproved}
                        onCheckedChange={async (checked) => {
                          try {
                            const current = taSettings.quizDaysEnabled || [];
                            const updated = checked
                              ? [...current, day].sort((a, b) => a - b)
                              : current.filter(d => d !== day);
                            await saveTASettings({ ...taSettings, quizDaysEnabled: updated, quizEnabled: updated.length > 0 });
                            toast.success(`Day ${day} Quiz ${checked ? "enabled" : "disabled"} for students`);
                          } catch {
                            toast.error("Failed to update quiz availability");
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Daily Quiz Questions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5" /> Daily Quiz Questions</CardTitle>
                  <CardDescription>Each question must be tagged with a day number. These never appear in exam or study mode.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openAddDialog("daily_quiz")}><Plus className="mr-1 h-4 w-4" /> Add Question</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderFilterBar(true)}
              <p className="text-xs text-muted-foreground">
                 Showing <strong className="text-foreground">{filterQuestions(quizQuestions, true).length}</strong> of {quizQuestions.length} quiz questions
                 {uniqueQuizDays.map((day) => (
                   <span key={day}>
                     <span className="ml-2">·</span>
                     <span className="ml-2">{questionsByDay(day).length} Day {day}</span>
                   </span>
                 ))}
              </p>
              <div className="space-y-3">
                {filterQuestions(quizQuestions, true).length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">No daily quiz questions yet. Add your first question above.</p>
                  </div>
                ) : filterQuestions(quizQuestions, true).map(renderQuestionCard)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── STUDY TAB ─── */}
        <TabsContent value="study" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-base">Study Mode</CardTitle>
                  <CardDescription>Practice questions for students to use in study/learning mode. These never appear in exams or daily quizzes.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Study mode questions are available for unlimited practice. They are completely separate from exam and daily quiz questions.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5" /> Study Questions</CardTitle>
                  <CardDescription>These questions are exclusive to study mode.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openAddDialog("learning")}><Plus className="mr-1 h-4 w-4" /> Add Question</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderFilterBar()}
              <p className="text-xs text-muted-foreground">
                Showing <strong className="text-foreground">{filterQuestions(studyQuestions).length}</strong> of {studyQuestions.length} study questions
              </p>
              <div className="space-y-3">
                {filterQuestions(studyQuestions).length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">No study questions yet. Add your first question above.</p>
                  </div>
                ) : filterQuestions(studyQuestions).map(renderQuestionCard)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Question — {modeLabel(formMode)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Mode indicator */}
            <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Assigned Mode</Label>
                <p className="text-sm font-medium">{modeLabel(formMode)}</p>
              </div>
              <Select value={formMode} onValueChange={(v) => setFormMode(v as QuestionMode)}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exam">Exam Mode</SelectItem>
                  <SelectItem value="daily_quiz">Daily Quiz</SelectItem>
                  <SelectItem value="learning">Study Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea placeholder="Enter your question..." value={formQuestion} onChange={(e) => setFormQuestion(e.target.value)} />
            </div>

            {formType === "MCQ" ? (
              <div className="space-y-3">
                <Label>Answer Choices</Label>
                <p className="text-xs text-muted-foreground">Enter options and select the correct answer</p>
                {formOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correctAnswer" checked={formCorrectIndex === i} onChange={() => setFormCorrectIndex(i)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    <Input placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt} onChange={(e) => updateOption(i, e.target.value)} className="flex-1" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Answer</Label>
                <Textarea placeholder="Enter the expected answer..." value={formAnswer} onChange={(e) => setFormAnswer(e.target.value)} />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Select value={formTopic} onValueChange={setFormTopic}>
                  <SelectTrigger><SelectValue placeholder="Select topic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Variables & Data Types">Variables & Data Types</SelectItem>
                    <SelectItem value="Control Flow">Control Flow</SelectItem>
                    <SelectItem value="Functions">Functions</SelectItem>
                    <SelectItem value="Lists & Dictionaries">Lists & Dictionaries</SelectItem>
                    <SelectItem value="File Handling">File Handling</SelectItem>
                    <SelectItem value="OOP Basics">OOP Basics</SelectItem>
                    <SelectItem value="Error Handling">Error Handling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={formDifficulty} onValueChange={(v: any) => setFormDifficulty(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MCQ">Multiple Choice</SelectItem>
                    <SelectItem value="Short Answer">Short Answer</SelectItem>
                    <SelectItem value="Code Practice">Code Practice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Day assignment — only for Daily Quiz */}
            {formMode === "daily_quiz" && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Quiz Day Assignment <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">Assign this question to a day number (e.g. 1, 2, 3…).</p>
                <Input
                  type="number"
                  min={1}
                  value={formQuizDay}
                  onChange={(e) => setFormQuizDay(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formQuestion.trim() || !formTopic || (formMode === "daily_quiz" && !formQuizDay)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assessments;
