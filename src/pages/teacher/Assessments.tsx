import { useState } from "react";
import { mockQuizQuestions, mockContentItems } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, ClipboardCheck, BookOpen, Flag, AlertTriangle } from "lucide-react";

interface CustomQuestion {
  id: string;
  question: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  mandatory: boolean;
  examType: boolean;
}

const Assessments = () => {
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([
    { id: "cq1", question: "Explain the difference between preemptive and non-preemptive scheduling with examples.", topic: "CPU Scheduling", difficulty: "Medium", mandatory: true, examType: true },
    { id: "cq2", question: "Write pseudocode for the Banker's Algorithm for deadlock avoidance.", topic: "Deadlocks", difficulty: "Hard", mandatory: false, examType: true },
  ]);

  const [showAdd, setShowAdd] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [newMandatory, setNewMandatory] = useState(false);
  const [newExamType, setNewExamType] = useState(false);

  const examItems = mockContentItems.filter((i) => i.type === "exam");

  const handleAddQuestion = () => {
    if (!newQuestion.trim() || !newTopic) return;
    setCustomQuestions((prev) => [
      ...prev,
      {
        id: `cq${Date.now()}`,
        question: newQuestion,
        topic: newTopic,
        difficulty: newDifficulty,
        mandatory: newMandatory,
        examType: newExamType,
      },
    ]);
    setNewQuestion("");
    setNewTopic("");
    setNewMandatory(false);
    setNewExamType(false);
    setShowAdd(false);
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Assessments</h1>
        <p className="text-muted-foreground">Manage quizzes, exams, and add custom questions</p>
      </div>

      <Tabs defaultValue="quizzes">
        <TabsList className="mb-6">
          <TabsTrigger value="quizzes">Quiz Bank</TabsTrigger>
          <TabsTrigger value="exams">Exam Simulations</TabsTrigger>
          <TabsTrigger value="custom">Custom Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="quizzes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Quiz Questions</CardTitle>
              <CardDescription>Questions used in student diagnostic and practice quizzes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockQuizQuestions.map((q) => (
                <div key={q.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={q.difficulty === "Easy" ? "secondary" : q.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
                      {q.difficulty}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{q.topic}</span>
                  </div>
                  <p className="text-sm font-medium">{q.question}</p>
                  <div className="mt-2 space-y-1">
                    {q.options.map((opt, i) => (
                      <p key={i} className={`text-xs ${i === q.correctIndex ? "text-success font-medium" : "text-muted-foreground"}`}>
                        {String.fromCharCode(65 + i)}. {opt}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exam Simulations</CardTitle>
              <CardDescription>Exam content visible to students in exam prep mode</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {examItems.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">{item.difficulty}</Badge>
                    <span className="text-xs text-muted-foreground">{item.topic}</span>
                  </div>
                  <h4 className="text-sm font-medium">{item.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{item.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Custom Questions</CardTitle>
                  <CardDescription>Add your own questions. Mark them as mandatory for quizzes or flag as exam-type for student visibility.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAdd && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Enter your question..."
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Topic</Label>
                      <Select value={newTopic} onValueChange={setNewTopic}>
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
                      <Select value={newDifficulty} onValueChange={(v: any) => setNewDifficulty(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Mandatory in Quizzes</Label>
                        <p className="text-xs text-muted-foreground">This question will always appear in student quizzes</p>
                      </div>
                      <Switch checked={newMandatory} onCheckedChange={setNewMandatory} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Exam-Type Question</Label>
                        <p className="text-xs text-muted-foreground">Flag as the type of question that will appear in exams (visible to students)</p>
                      </div>
                      <Switch checked={newExamType} onCheckedChange={setNewExamType} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleAddQuestion} disabled={!newQuestion.trim() || !newTopic}>Add Question</Button>
                  </div>
                </div>
              )}

              {customQuestions.map((q) => (
                <div key={q.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant={q.difficulty === "Easy" ? "secondary" : q.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
                      {q.difficulty}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{q.topic}</span>
                    {q.mandatory && (
                      <Badge variant="default" className="text-[10px]">
                        <Flag className="mr-1 h-3 w-3" /> Mandatory
                      </Badge>
                    )}
                    {q.examType && (
                      <Badge variant="secondary" className="text-[10px] border-warning/50 bg-warning/10 text-warning">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Exam-Type
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{q.question}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Assessments;
