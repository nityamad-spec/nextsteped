import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, ClipboardCheck, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [formType, setFormType] = useState<QuestionType>("MCQ");

  const openAddDialog = () => {
    setEditingId(null);
    setFormQuestion("");
    setFormTopic("");
    setFormDifficulty("Medium");
    setFormType("MCQ");
    setDialogOpen(true);
  };

  const openEditDialog = (q: EditableQuestion) => {
    setEditingId(q.id);
    setFormQuestion(q.question);
    setFormTopic(q.topic);
    setFormDifficulty(q.difficulty);
    setFormType(q.type);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formQuestion.trim() || !formTopic) return;
    if (editingId) {
      setQuestions((prev) => prev.map((q) => q.id === editingId ? { ...q, question: formQuestion, topic: formTopic, difficulty: formDifficulty, type: formType } : q));
    } else {
      setQuestions((prev) => [...prev, { id: `q${Date.now()}`, question: formQuestion, topic: formTopic, difficulty: formDifficulty, type: formType }]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const typeBadgeColor = (type: QuestionType) => {
    switch (type) {
      case "MCQ": return "bg-primary/10 text-primary";
      case "Short Answer": return "bg-warning/10 text-warning";
      case "Code Practice": return "bg-accent/10 text-accent";
    }
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Assessments</h1>
        <p className="text-muted-foreground">Add your custom practice questions for students</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Custom Practice Questions</CardTitle>
              <CardDescription>Add your own questions that students will encounter during learning and exam prep sessions.</CardDescription>
            </div>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="mr-1 h-4 w-4" /> Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.length === 0 && (
            <div className="rounded-lg border-2 border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">No custom questions added yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Add Question" to create your first custom practice problem.</p>
            </div>
          )}
          {questions.map((q) => (
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
                  <button onClick={() => openEditDialog(q)} className="rounded p-1.5 hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(q.id)} className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm font-medium">{q.question}</p>
            </div>
          ))}
        </CardContent>
      </Card>

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
