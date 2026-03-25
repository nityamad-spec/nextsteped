import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { mockQuizQuestions } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, ClipboardCheck, Pencil, Trash2, Filter, Shield, BookOpen, Clock, ClipboardList, Info, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type QuestionType = "MCQ" | "Short Answer" | "Code Practice";
type QuestionMode = "learning" | "exam" | "daily_quiz";

interface EditableQuestion {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  type: QuestionType;
  modes: QuestionMode[];
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  quizDay?: 1 | 2; // Day assignment for daily quiz questions
}

const seedQuestions: EditableQuestion[] = mockQuizQuestions.map((q, i) => ({
  ...q,
  answer: q.options?.[q.correctIndex] || "",
  type: "MCQ" as QuestionType,
  modes: ["learning", "exam", "daily_quiz"] as QuestionMode[],
  quizDay: (i % 2 === 0 ? 1 : 2) as 1 | 2,
}));

const Assessments = () => {
  const { taSettings, setTASettings } = useApp();
  const [questions, setQuestions] = useState<EditableQuestion[]>(seedQuestions);
  const [examPredefinedOnly, setExamPredefinedOnly] = useState(false);

  // Multi-select filters
  const [filterModes, setFilterModes] = useState<QuestionMode[]>([]);
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
  const [formModes, setFormModes] = useState<QuestionMode[]>(["learning", "exam", "daily_quiz"]);
  const [formOptions, setFormOptions] = useState<string[]>(["", "", "", ""]);
  const [formCorrectIndex, setFormCorrectIndex] = useState<number>(0);
  const [formQuizDay, setFormQuizDay] = useState<1 | 2 | undefined>(1);

  // Exam settings
  const [examTimeLimit, setExamTimeLimit] = useState(taSettings.examTimeLimit || 60);
  const [examManualQuestions, setExamManualQuestions] = useState(false);
  const [examManualCount, setExamManualCount] = useState(20);

  // Daily quiz settings
  const [quizNumQuestions, setQuizNumQuestions] = useState(taSettings.quizNumQuestions || 5);
  const [quizQuestionTypes, setQuizQuestionTypes] = useState(taSettings.quizQuestionMix || "mixed");
  const [quizTimeLimit, setQuizTimeLimit] = useState(taSettings.quizTimeLimit || 10);

  const examEstimate = Math.max(5, Math.round(examTimeLimit / 3));

  const toggleMode = (mode: QuestionMode) => {
    setFormModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const toggleFilterMode = (mode: QuestionMode) => {
    setFilterModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const toggleFilterDifficulty = (diff: string) => {
    setFilterDifficulties((prev) =>
      prev.includes(diff) ? prev.filter((d) => d !== diff) : [...prev, diff]
    );
  };

  const toggleFilterType = (type: string) => {
    setFilterTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleFilterDay = (day: number) => {
    setFilterDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const openAddDialog = () => {
    setEditingId(null);
    setFormQuestion("");
    setFormAnswer("");
    setFormTopic("");
    setFormDifficulty("Medium");
    setFormType("MCQ");
    setFormModes(["learning", "exam", "daily_quiz"]);
    setFormOptions(["", "", "", ""]);
    setFormCorrectIndex(0);
    setFormQuizDay(1);
    setDialogOpen(true);
  };

  const openEditDialog = (q: EditableQuestion) => {
    setEditingId(q.id);
    setFormQuestion(q.question);
    setFormAnswer(q.answer || "");
    setFormTopic(q.topic);
    setFormDifficulty(q.difficulty);
    setFormType(q.type);
    setFormModes(q.modes);
    setFormOptions(q.options?.length ? [...q.options] : ["", "", "", ""]);
    setFormCorrectIndex(q.correctIndex ?? 0);
    setFormQuizDay(q.quizDay);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formQuestion.trim() || !formTopic || formModes.length === 0) return;
    const isMCQ = formType === "MCQ";
    const isDailyQuiz = formModes.includes("daily_quiz");
    const newQ: EditableQuestion = {
      id: editingId || `q${Date.now()}`,
      question: formQuestion,
      answer: isMCQ ? formOptions[formCorrectIndex] || "" : formAnswer,
      topic: formTopic,
      difficulty: formDifficulty,
      type: formType,
      modes: formModes,
      ...(isMCQ ? { options: formOptions.filter(o => o.trim()), correctIndex: formCorrectIndex } : {}),
      ...(isDailyQuiz && formQuizDay ? { quizDay: formQuizDay } : {}),
    };
    if (editingId) {
      setQuestions((prev) => prev.map((q) => q.id === editingId ? newQ : q));
    } else {
      setQuestions((prev) => [...prev, newQ]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const updateOption = (index: number, value: string) => {
    setFormOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const handleSaveQuizSettings = () => {
    setTASettings({
      ...taSettings,
      quizNumQuestions: quizNumQuestions,
      quizQuestionMix: quizQuestionTypes,
      quizTimeLimit: quizTimeLimit,
    });
  };

  const handleSaveExamSettings = () => {
    setTASettings({
      ...taSettings,
      examTimeLimit: examTimeLimit,
    });
  };

  // Filtering with multi-select
  const filteredQuestions = questions.filter((q) => {
    if (filterModes.length > 0 && !filterModes.some(m => q.modes.includes(m))) return false;
    if (filterDifficulties.length > 0 && !filterDifficulties.includes(q.difficulty)) return false;
    if (filterTypes.length > 0 && !filterTypes.includes(q.type)) return false;
    if (filterDays.length > 0 && (!q.quizDay || !filterDays.includes(q.quizDay))) return false;
    return true;
  });

  const examQuestions = questions.filter(q => q.modes.includes("exam"));
  const quizQuestions = questions.filter(q => q.modes.includes("daily_quiz"));
  const day1Questions = quizQuestions.filter(q => q.quizDay === 1);
  const day2Questions = quizQuestions.filter(q => q.quizDay === 2);

  const typeBadgeColor = (type: QuestionType) => {
    switch (type) {
      case "MCQ": return "bg-primary/10 text-primary";
      case "Short Answer": return "bg-warning/10 text-warning";
      case "Code Practice": return "bg-accent/10 text-accent";
    }
  };

  const modeBadge = (mode: QuestionMode) => {
    switch (mode) {
      case "learning": return "bg-mastery-proficient/10 text-mastery-proficient";
      case "exam": return "bg-mastery-developing/10 text-mastery-developing";
      case "daily_quiz": return "bg-primary/10 text-primary";
    }
  };

  const modeLabel = (mode: QuestionMode) => {
    switch (mode) {
      case "learning": return "Study";
      case "exam": return "Exam";
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
          {q.modes.map((mode) => (
            <Badge key={mode} variant="outline" className={`text-[10px] ${modeBadge(mode)}`}>
              {modeLabel(mode)}
            </Badge>
          ))}
          {q.modes.includes("daily_quiz") && q.quizDay && (
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
      <p className="text-sm font-medium">{q.question}</p>
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

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Assessments</h1>
        <p className="text-muted-foreground">Manage questions for study mode, daily quizzes, and exams</p>
      </div>

      {/* Exam & Quiz Settings */}
      <Tabs defaultValue="exam" className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="exam" className="gap-2"><Clock className="h-4 w-4" /> Exam Settings</TabsTrigger>
          <TabsTrigger value="quiz" className="gap-2"><ClipboardList className="h-4 w-4" /> Daily Quiz Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="exam">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Exam Mode Settings</CardTitle>
                  <CardDescription>Control how exams are presented to students</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Use predefined questions only (Exam only)</p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, exam mode will only show your custom questions — no auto-generated questions. This does not apply to daily quizzes.
                  </p>
                </div>
                <Switch checked={examPredefinedOnly} onCheckedChange={setExamPredefinedOnly} />
              </div>
              {examPredefinedOnly && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{examQuestions.length}</strong> questions tagged for Exam mode will be used.
                  </p>
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
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Number of Questions</Label>
                  </div>
                  <Button
                    variant={examManualQuestions ? "default" : "outline"}
                    size="sm" className="h-7 text-xs"
                    onClick={() => setExamManualQuestions(!examManualQuestions)}
                  >
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
                  <p className="text-xs text-muted-foreground">
                    Based on {examTimeLimit} min — estimated <span className="font-bold text-foreground">{examEstimate} questions</span>
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Question Types</Label>
                <Select value={taSettings.examQuestionMix} onValueChange={(v) => setTASettings({ ...taSettings, examQuestionMix: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed (MCQ + Short Answer + Problem Solving)</SelectItem>
                    <SelectItem value="mcq_only">Multiple Choice Only</SelectItem>
                    <SelectItem value="short_answer">Short Answer Only</SelectItem>
                    <SelectItem value="problem_solving">Problem Solving Only</SelectItem>
                    <SelectItem value="mcq_short">MCQ + Short Answer</SelectItem>
                    <SelectItem value="mcq_problem">MCQ + Problem Solving</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Difficulty</Label>
                <Select value={taSettings.examDifficulty} onValueChange={(v: any) => setTASettings({ ...taSettings, examDifficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                    <SelectItem value="Mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Question Presentation</Label>
                <Select value={taSettings.examPresentation || "all_at_once"} onValueChange={(v: any) => setTASettings({ ...taSettings, examPresentation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_at_once">All at once (most realistic)</SelectItem>
                    <SelectItem value="one_by_one">One by one</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">All at once mirrors a real exam format.</p>
              </div>
              <Button onClick={handleSaveExamSettings} className="w-full">Save Exam Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quiz">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Daily Quiz Settings</CardTitle>
                  <CardDescription>Configure daily quiz parameters for students</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Standardized quiz info */}
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">Standardized daily quizzes:</strong> Daily quizzes are <strong>not adaptive</strong>. All students receive the same set of questions for each day.</p>
                  <p>Tag your questions as <strong>Day 1</strong> or <strong>Day 2</strong> in the question bank below to control which questions appear in each daily quiz.</p>
                </div>
              </div>

              {/* Day question counts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-bold text-primary">{day1Questions.length}</p>
                  <p className="text-xs text-muted-foreground">Day 1 Questions</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-bold text-primary">{day2Questions.length}</p>
                  <p className="text-xs text-muted-foreground">Day 2 Questions</p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Questions Per Quiz</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[quizNumQuestions]} onValueChange={(v) => setQuizNumQuestions(v[0])} min={3} max={20} step={1} className="flex-1" />
                  <span className="w-16 text-right text-sm font-bold">{quizNumQuestions}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  If fewer questions are tagged for a day than this number, all available questions for that day will be used.
                </p>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Custom Questions</CardTitle>
              <CardDescription>Add questions and assign them to Study, Daily Quiz (Day 1 or Day 2), Exam, or all modes.</CardDescription>
            </div>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="mr-1 h-4 w-4" /> Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Multi-select Filters */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {(filterModes.length > 0 || filterDifficulties.length > 0 || filterTypes.length > 0 || filterDays.length > 0) && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { setFilterModes([]); setFilterDifficulties([]); setFilterTypes([]); setFilterDays([]); }}>
                  Clear all
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <div className="flex flex-wrap gap-2">
                {(["learning", "exam", "daily_quiz"] as QuestionMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => toggleFilterMode(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      filterModes.includes(mode) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {modeLabel(mode)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quiz Day</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 2].map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleFilterDay(day)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      filterDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    Day {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Difficulty</Label>
              <div className="flex flex-wrap gap-2">
                {["Easy", "Medium", "Hard"].map((diff) => (
                  <button
                    key={diff}
                    onClick={() => toggleFilterDifficulty(diff)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      filterDifficulties.includes(diff) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <div className="flex flex-wrap gap-2">
                {(["MCQ", "Short Answer", "Code Practice"] as QuestionType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleFilterType(type)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      filterTypes.includes(type) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question count summary */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Showing <strong className="text-foreground">{filteredQuestions.length}</strong> questions</span>
            <span>·</span>
            <span>{examQuestions.length} Exam</span>
            <span>·</span>
            <span>{day1Questions.length} Quiz Day 1</span>
            <span>·</span>
            <span>{day2Questions.length} Quiz Day 2</span>
          </div>

          {/* Question list */}
          <div className="space-y-3">
            {filteredQuestions.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">No questions match your filters.</p>
              </div>
            ) : (
              filteredQuestions.map(renderQuestionCard)
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={formCorrectIndex === i}
                      onChange={() => setFormCorrectIndex(i)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <Input
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      className="flex-1"
                    />
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

            {/* Mode selection */}
            <div className="space-y-2">
              <Label>Available In <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">Choose where this question will appear for students</p>
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mode-learning"
                    checked={formModes.includes("learning")}
                    onCheckedChange={() => toggleMode("learning")}
                  />
                  <label htmlFor="mode-learning" className="text-sm cursor-pointer">Study Mode</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mode-quiz"
                    checked={formModes.includes("daily_quiz")}
                    onCheckedChange={() => toggleMode("daily_quiz")}
                  />
                  <label htmlFor="mode-quiz" className="text-sm cursor-pointer">Daily Quiz</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mode-exam"
                    checked={formModes.includes("exam")}
                    onCheckedChange={() => toggleMode("exam")}
                  />
                  <label htmlFor="mode-exam" className="text-sm cursor-pointer">Exam Mode</label>
                </div>
              </div>
              {formModes.length === 0 && (
                <p className="text-xs text-destructive">Select at least one mode</p>
              )}
            </div>

            {/* Day assignment - only shown when Daily Quiz is selected */}
            {formModes.includes("daily_quiz") && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Quiz Day Assignment <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Daily quizzes are standardized — all students get the same questions. Assign this question to the correct day.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant={formQuizDay === 1 ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    onClick={() => setFormQuizDay(1)}
                  >
                    Day 1
                  </Button>
                  <Button
                    type="button"
                    variant={formQuizDay === 2 ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    onClick={() => setFormQuizDay(2)}
                  >
                    Day 2
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formQuestion.trim() || !formTopic || formModes.length === 0 || (formModes.includes("daily_quiz") && !formQuizDay)}>{editingId ? "Save Changes" : "Add Question"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assessments;
