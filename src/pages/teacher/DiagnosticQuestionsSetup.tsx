import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowRight, ArrowLeft, Brain, Plus, Pencil, Trash2, Check, X,
  ChevronDown, ChevronUp, GripVertical, Info,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import { useToast } from "@/hooks/use-toast";

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

interface DiagnosticQuestion {
  id: string;
  question: string;
  type: QuestionType;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  explanation: string;
  approved: boolean;
}

const makeId = () => `dq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Auto-generated starter questions based on course material
const generatedQuestions: DiagnosticQuestion[] = [
  {
    id: "dq1", question: "What is the output of print(type(3.14)) in Python?",
    type: "mcq", topic: "Variables & Data Types", difficulty: "Easy",
    options: ["<class 'float'>", "<class 'int'>", "<class 'str'>", "<class 'double'>"],
    correctIndex: 0, explanation: "3.14 is a floating-point number, so type() returns <class 'float'>.",
    approved: false,
  },
  {
    id: "dq2", question: "Which loop is best when you know the number of iterations?",
    type: "mcq", topic: "Control Flow", difficulty: "Medium",
    options: ["while loop", "for loop", "do-while loop", "repeat loop"],
    correctIndex: 1, explanation: "A for loop is ideal when the number of iterations is known in advance.",
    approved: false,
  },
  {
    id: "dq3", question: "What does the 'return' statement do in a function?",
    type: "mcq", topic: "Functions", difficulty: "Hard",
    options: ["Exits the function and returns a value", "Prints a value", "Loops the function", "Imports a module"],
    correctIndex: 0, explanation: "The return statement exits the function and optionally passes back a value to the caller.",
    approved: false,
  },
  {
    id: "dq4", question: "How do you access the value associated with key 'name' in a dictionary d?",
    type: "mcq", topic: "Lists & Dictionaries", difficulty: "Medium",
    options: ["d['name']", "d.name", "d(name)", "d->name"],
    correctIndex: 0, explanation: "Dictionary values are accessed using square bracket notation with the key.",
    approved: false,
  },
  {
    id: "dq5", question: "Python is a statically typed language.",
    type: "true_false", topic: "Variables & Data Types", difficulty: "Easy",
    options: ["True", "False"], correctIndex: 1,
    explanation: "Python is dynamically typed — variable types are determined at runtime, not at compile time.",
    approved: false,
  },
  {
    id: "dq6", question: "What is the correct way to open a file for reading in Python?",
    type: "mcq", topic: "File Handling", difficulty: "Easy",
    options: ["open('file.txt', 'r')", "open('file.txt', 'w')", "read('file.txt')", "file.open('file.txt')"],
    correctIndex: 0, explanation: "open() with 'r' mode opens a file for reading.",
    approved: false,
  },
  {
    id: "dq7", question: "What is __init__ in a Python class?",
    type: "mcq", topic: "OOP Basics", difficulty: "Medium",
    options: ["Constructor method", "Destructor method", "Static method", "Class method"],
    correctIndex: 0, explanation: "__init__ is the constructor method called when an object is instantiated.",
    approved: false,
  },
];

const emptyQuestion = (type: QuestionType = "mcq"): DiagnosticQuestion => ({
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
});

const DiagnosticQuestionsSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>(generatedQuestions);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DiagnosticQuestion | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; title: string } | null>(null);
  const [approveAllConfirm, setApproveAllConfirm] = useState(false);

  const approvedCount = questions.filter((q) => q.approved).length;
  const allApproved = questions.length > 0 && approvedCount === questions.length;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleApprove = (id: string) => {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, approved: !q.approved } : q));
  };

  const startEdit = (q: DiagnosticQuestion) => {
    setEditingId(q.id);
    setEditDraft({ ...q, options: q.options ? [...q.options] : undefined });
    if (!expandedIds.includes(q.id)) setExpandedIds((prev) => [...prev, q.id]);
  };

  const saveEdit = () => {
    if (!editDraft || !editingId) return;
    if (!editDraft.question.trim()) {
      toast({ title: "Question text is required", variant: "destructive" });
      return;
    }
    setQuestions((prev) => prev.map((q) => q.id === editingId ? { ...editDraft } : q));
    setEditingId(null);
    setEditDraft(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const confirmRemove = (q: DiagnosticQuestion) => {
    setRemoveConfirm({ id: q.id, title: q.question.slice(0, 60) || "Untitled question" });
  };

  const executeRemove = () => {
    if (!removeConfirm) return;
    const removed = questions.find((q) => q.id === removeConfirm.id);
    setQuestions((prev) => prev.filter((q) => q.id !== removeConfirm.id));
    setRemoveConfirm(null);
    if (removed) {
      toast({
        title: "Question removed",
        description: removed.question.slice(0, 50),
        action: (
          <Button variant="outline" size="sm" onClick={() => setQuestions((prev) => [...prev, removed])}>
            Undo
          </Button>
        ),
      });
    }
  };

  const addQuestion = (type: QuestionType) => {
    const newQ = emptyQuestion(type);
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

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={4} />
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
        <div className="mb-4 flex items-center justify-between rounded-lg border px-4 py-2.5 bg-muted/30">
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

        {/* Questions list */}
        <div className="space-y-2 mb-6">
          {questions.map((q, idx) => {
            const isExpanded = expandedIds.includes(q.id);
            const isEditing = editingId === q.id;

            return (
              <Card key={q.id} className={q.approved ? "border-primary/30" : ""}>
                <div
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${q.approved ? "bg-primary/5" : ""}`}
                  onClick={() => !isEditing && toggleExpand(q.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">Q{idx + 1}</span>
                    <span className="text-sm truncate">{q.question || "New question..."}</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${questionTypeColors[q.type]}`}>
                      {questionTypeLabels[q.type]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
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

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Topic</Label>
                                <Input className="h-8 text-xs" value={editDraft.topic} onChange={(e) => setEditDraft({ ...editDraft, topic: e.target.value })} placeholder="e.g. Variables & Data Types" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Difficulty</Label>
                                <Select value={editDraft.difficulty} onValueChange={(v: "Easy" | "Medium" | "Hard") => setEditDraft({ ...editDraft, difficulty: v })}>
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

                            <div className="flex items-center gap-2 pt-1">
                              <Button size="sm" onClick={saveEdit}><Check className="mr-1 h-3.5 w-3.5" /> Save</Button>
                              <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          /* View mode */
                          <div className="space-y-2">
                            {q.topic && (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">{q.topic}</Badge>
                                <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                              </div>
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

                            <div className="flex items-center gap-2 pt-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEdit(q)}>
                                <Pencil className="mr-1 h-3 w-3" /> Edit
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => confirmRemove(q)}>
                                <Trash2 className="mr-1 h-3 w-3" /> Remove
                              </Button>
                              <Button
                                size="sm"
                                variant={q.approved ? "default" : "outline"}
                                className="h-7 text-xs ml-auto"
                                onClick={() => toggleApprove(q.id)}
                              >
                                {q.approved ? <><Check className="mr-1 h-3 w-3" /> Approved</> : "Approve"}
                              </Button>
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
