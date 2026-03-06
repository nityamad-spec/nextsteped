import { useState } from "react";
import { mockQuizQuestions } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, ClipboardCheck, Pencil, Trash2, Filter, Shield } from "lucide-react";
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
}

const seedQuestions: EditableQuestion[] = mockQuizQuestions.map((q) => ({
  ...q,
  answer: q.options?.[q.correctIndex] || "",
  type: "MCQ" as QuestionType,
  modes: ["learning", "exam", "daily_quiz"] as QuestionMode[],
}));

const Assessments = () => {
  const [questions, setQuestions] = useState<EditableQuestion[]>(seedQuestions);
  const [examPredefinedOnly, setExamPredefinedOnly] = useState(false);

  // Filters
  const [filterMode, setFilterMode] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

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

  const toggleMode = (mode: QuestionMode) => {
    setFormModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
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
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formQuestion.trim() || !formTopic || formModes.length === 0) return;
    const isMCQ = formType === "MCQ";
    const newQ: EditableQuestion = {
      id: editingId || `q${Date.now()}`,
      question: formQuestion,
      answer: isMCQ ? formOptions[formCorrectIndex] || "" : formAnswer,
      topic: formTopic,
      difficulty: formDifficulty,
      type: formType,
      modes: formModes,
      ...(isMCQ ? { options: formOptions.filter(o => o.trim()), correctIndex: formCorrectIndex } : {}),
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

  // Filtering
  const filteredQuestions = questions.filter((q) => {
    if (filterMode !== "all" && !q.modes.includes(filterMode as QuestionMode)) return false;
    if (filterDifficulty !== "all" && q.difficulty !== filterDifficulty) return false;
    if (filterType !== "all" && q.type !== filterType) return false;
    return true;
  });

  const examQuestions = questions.filter(q => q.modes.includes("exam"));
  const quizQuestions = questions.filter(q => q.modes.includes("daily_quiz"));

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

      {/* Exam Settings Card */}
      <Card className="mb-6">
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
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Use predefined questions only</p>
              <p className="text-xs text-muted-foreground">
                When enabled, exam mode will only show your custom questions — no auto-generated questions will be included.
                Exam questions will be standard for all students.
              </p>
            </div>
            <Switch checked={examPredefinedOnly} onCheckedChange={setExamPredefinedOnly} />
          </div>
          {examPredefinedOnly && (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">{examQuestions.length}</strong> questions tagged for Exam mode · <strong className="text-foreground">{quizQuestions.length}</strong> questions tagged for Daily Quiz
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questions with tabs for All / Exam / Daily Quiz */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Custom Questions</CardTitle>
              <CardDescription>Add questions and assign them to Study, Daily Quiz, Exam, or all modes.</CardDescription>
            </div>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="mr-1 h-4 w-4" /> Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Mode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="learning">Study Only</SelectItem>
                <SelectItem value="exam">Exam Only</SelectItem>
                <SelectItem value="daily_quiz">Daily Quiz Only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Difficulty" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="Easy">Easy</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Hard">Hard</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="MCQ">MCQ</SelectItem>
                <SelectItem value="Short Answer">Short Answer</SelectItem>
                <SelectItem value="Code Practice">Code Practice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="all">
            <TabsList className="mb-3">
              <TabsTrigger value="all">All ({filteredQuestions.length})</TabsTrigger>
              <TabsTrigger value="exam">Exam ({examQuestions.length})</TabsTrigger>
              <TabsTrigger value="quiz">Daily Quiz ({quizQuestions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-3">
              {filteredQuestions.length === 0 && (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">No questions match your filters.</p>
                </div>
              )}
              {filteredQuestions.map(renderQuestionCard)}
            </TabsContent>

            <TabsContent value="exam" className="space-y-3">
              {examQuestions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">No exam questions yet. Add questions and tag them for Exam mode.</p>
                </div>
              ) : examQuestions.map(renderQuestionCard)}
            </TabsContent>

            <TabsContent value="quiz" className="space-y-3">
              {quizQuestions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">No daily quiz questions yet. Add questions and tag them for Daily Quiz mode.</p>
                </div>
              ) : quizQuestions.map(renderQuestionCard)}
            </TabsContent>
          </Tabs>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formQuestion.trim() || !formTopic || formModes.length === 0}>{editingId ? "Save Changes" : "Add Question"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assessments;
