import { useState } from "react";
import { mockQuizQuestions, mockContentItems } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, ClipboardCheck, BookOpen, Info, Pencil, Trash2, Upload, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type QuestionType = "MCQ" | "Short Answer" | "Code Practice";

interface EditableQuestion {
  id: string;
  question: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  type: QuestionType;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
}

const Assessments = () => {
  const [practiceQuestions, setPracticeQuestions] = useState<EditableQuestion[]>(
    mockQuizQuestions.map((q) => ({ ...q, type: "MCQ" as QuestionType }))
  );

  const examItems = mockContentItems.filter((i) => i.type === "exam");
  const [examQuestions, setExamQuestions] = useState<EditableQuestion[]>(
    examItems.map((item) => ({
      id: item.id,
      question: item.title,
      topic: item.topic,
      difficulty: item.difficulty,
      type: "Short Answer" as QuestionType,
      explanation: item.content,
    }))
  );

  // Add/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"practice" | "exams">("practice");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [formType, setFormType] = useState<QuestionType>("MCQ");

  const openAddDialog = (tab: "practice" | "exams") => {
    setDialogTab(tab);
    setEditingId(null);
    setFormQuestion("");
    setFormTopic("");
    setFormDifficulty("Medium");
    setFormType("MCQ");
    setDialogOpen(true);
  };

  const openEditDialog = (tab: "practice" | "exams", q: EditableQuestion) => {
    setDialogTab(tab);
    setEditingId(q.id);
    setFormQuestion(q.question);
    setFormTopic(q.topic);
    setFormDifficulty(q.difficulty);
    setFormType(q.type);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formQuestion.trim() || !formTopic) return;
    const setter = dialogTab === "practice" ? setPracticeQuestions : setExamQuestions;
    if (editingId) {
      setter((prev) => prev.map((q) => q.id === editingId ? { ...q, question: formQuestion, topic: formTopic, difficulty: formDifficulty, type: formType } : q));
    } else {
      setter((prev) => [...prev, { id: `q${Date.now()}`, question: formQuestion, topic: formTopic, difficulty: formDifficulty, type: formType }]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (tab: "practice" | "exams", id: string) => {
    const setter = tab === "practice" ? setPracticeQuestions : setExamQuestions;
    setter((prev) => prev.filter((q) => q.id !== id));
  };

  const typeBadgeColor = (type: QuestionType) => {
    switch (type) {
      case "MCQ": return "bg-primary/10 text-primary";
      case "Short Answer": return "bg-warning/10 text-warning";
      case "Code Practice": return "bg-accent/10 text-accent";
    }
  };

  const renderQuestion = (tab: "practice" | "exams", q: EditableQuestion) => (
    <div key={q.id} className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={q.difficulty === "Easy" ? "secondary" : q.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
            {q.difficulty}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${typeBadgeColor(q.type)}`}>{q.type}</Badge>
          <span className="text-xs text-muted-foreground">{q.topic}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openEditDialog(tab, q)} className="rounded p-1.5 hover:bg-muted">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => handleDelete(tab, q.id)} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm font-medium">{q.question}</p>
      {q.options && q.type === "MCQ" && (
        <div className="mt-2 space-y-1">
          {q.options.map((opt, i) => (
            <p key={i} className={`text-xs ${i === q.correctIndex ? "text-success font-medium" : "text-muted-foreground"}`}>
              {String.fromCharCode(65 + i)}. {opt}
            </p>
          ))}
        </div>
      )}
      {q.explanation && q.type !== "MCQ" && (
        <p className="mt-1.5 text-xs text-muted-foreground">{q.explanation}</p>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Assessments</h1>
        <p className="text-muted-foreground">Manage practice questions, exams, and lesson materials</p>
      </div>

      {/* Illustrative notice */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Preview / Illustrative View</p>
          <p className="text-xs text-muted-foreground">
            The questions and assessments shown below are illustrative examples. The AI TA dynamically generates and personalizes content based on individual student responses and progress.
          </p>
        </div>
      </div>

      <Tabs defaultValue="practice">
        <TabsList className="mb-6">
          <TabsTrigger value="practice">Practice Questions</TabsTrigger>
          <TabsTrigger value="exams">Exam Simulations</TabsTrigger>
          <TabsTrigger value="lessons">Edit Lesson Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="practice" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Practice Questions</CardTitle>
                  <CardDescription>These are illustrative questions used in student learning mode under the AI TA chat. Questions are a mix of multiple choice, short answer, and code practice.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openAddDialog("practice")}>
                  <Plus className="mr-1 h-4 w-4" /> Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {practiceQuestions.map((q) => renderQuestion("practice", q))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exams" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exam Simulations</CardTitle>
                  <CardDescription>Sample exam content visible to students in exam prep mode. Includes multiple choice, short answer, and code practice questions.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openAddDialog("exams")}>
                  <Plus className="mr-1 h-4 w-4" /> Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {examQuestions.map((q) => renderQuestion("exams", q))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lessons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Edit Lesson Plan</CardTitle>
              <CardDescription>Update your lesson content, edit existing materials, or upload new resources for students.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-6 text-center space-y-3">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Upload New Materials</p>
                  <p className="text-xs text-muted-foreground">Drag and drop or click to upload slides, notes, or supplementary materials</p>
                </div>
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" /> Choose Files
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Current Materials</p>
                {["Course Syllabus — Operating Systems", "Module 1: Process Management Slides", "Module 2: Memory Management Notes", "Module 3: File Systems & Storage", "Module 4: Concurrency & Synchronization"].map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive">Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea placeholder="Enter your question..." value={formQuestion} onChange={(e) => setFormQuestion(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Select value={formTopic} onValueChange={setFormTopic}>
                  <SelectTrigger><SelectValue placeholder="Select topic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Process Management">Process Management</SelectItem>
                    <SelectItem value="CPU Scheduling">CPU Scheduling</SelectItem>
                    <SelectItem value="Memory Management">Memory Management</SelectItem>
                    <SelectItem value="Virtual Memory">Virtual Memory</SelectItem>
                    <SelectItem value="File Systems">File Systems</SelectItem>
                    <SelectItem value="Synchronization">Synchronization</SelectItem>
                    <SelectItem value="Deadlocks">Deadlocks</SelectItem>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formQuestion.trim() || !formTopic}>{editingId ? "Save Changes" : "Add Question"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assessments;
