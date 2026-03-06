import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Eye, MessageSquare, BookOpen, Calculator, Check, Pencil, Clock, ClipboardList } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";

const questionEstimate = (length: number, mix: string, difficulty: string) => {
  const base = Math.round(length / 3);
  const diffMod = difficulty === "Easy" ? 1.3 : difficulty === "Hard" ? 0.7 : 1;
  const total = Math.max(5, Math.round(base * diffMod));

  let breakdown: Record<string, number> = {};
  if (mix === "mixed") {
    breakdown = { MCQ: Math.round(total * 0.4), "Short Answer": Math.round(total * 0.3), "Problem Solving": total - Math.round(total * 0.4) - Math.round(total * 0.3) };
  } else if (mix === "mcq_only") {
    breakdown = { MCQ: total };
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

const AITASettings = () => {
  const { taSettings, setTASettings } = useApp();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(taSettings);
  const [examLength, setExamLength] = useState(taSettings.examTimeLimit || 60);
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix || "mixed");
  const [editingEstimate, setEditingEstimate] = useState(false);

  // Daily quiz settings
  const [quizNumQuestions, setQuizNumQuestions] = useState(taSettings.quizNumQuestions || 5);
  const [quizQuestionTypes, setQuizQuestionTypes] = useState(taSettings.quizQuestionMix || "mixed");
  const [quizDifficulty, setQuizDifficulty] = useState(taSettings.quizDifficulty || "Medium");
  const [quizTimeLimit, setQuizTimeLimit] = useState(taSettings.quizTimeLimit || 10);

  const estimate = useMemo(() => questionEstimate(examLength, examQuestionTypes, settings.examDifficulty), [examLength, examQuestionTypes, settings.examDifficulty]);
  const [customBreakdown, setCustomBreakdown] = useState<Record<string, number>>(estimate.breakdown);
  const [estimateApproved, setEstimateApproved] = useState(false);

  const update = (partial: Partial<typeof settings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    setEstimateApproved(false);
  };

  const handleExamLengthChange = (v: number) => {
    setExamLength(v);
    setEstimateApproved(false);
  };

  const handleExamTypeChange = (v: string) => {
    setExamQuestionTypes(v);
    setEstimateApproved(false);
  };

  const activeBreakdown = editingEstimate ? customBreakdown : estimate.breakdown;
  const activeTotal = Object.values(activeBreakdown).reduce((s, n) => s + n, 0);

  const handleApproveEstimate = () => {
    if (editingEstimate) setEditingEstimate(false);
    setEstimateApproved(true);
  };

  const handleEditEstimate = () => {
    setCustomBreakdown({ ...estimate.breakdown });
    setEditingEstimate(true);
    setEstimateApproved(false);
  };

  const [examApproved, setExamApproved] = useState(false);
  const [quizApproved, setQuizApproved] = useState(false);
  const [examManualQuestions, setExamManualQuestions] = useState(false);
  const [examManualCount, setExamManualCount] = useState(estimate.total);

  const handleSave = () => {
    setTASettings({
      ...settings,
      examTimeLimit: examLength,
      examQuestionMix: examQuestionTypes,
      quizNumQuestions,
      quizQuestionMix: quizQuestionTypes,
      quizDifficulty,
      quizTimeLimit,
    });
    navigate("/teacher/setup/publish");
  };

  const canContinue = examApproved && quizApproved;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={4} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Teaching Assistant Settings</h1>
          <p className="text-muted-foreground">Configure how the AI Teaching Assistant interacts with your students</p>
        </div>

        <div className="space-y-6">
          {/* Exam & Quiz Simulation Rules */}
          <Tabs defaultValue="exam">
            <TabsList className="mb-4">
              <TabsTrigger value="exam" className="gap-2"><Clock className="h-4 w-4" /> Exam Rules</TabsTrigger>
              <TabsTrigger value="quiz" className="gap-2"><ClipboardList className="h-4 w-4" /> Daily Quiz Rules</TabsTrigger>
            </TabsList>

            <TabsContent value="exam">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exam Simulation Rules</CardTitle>
                  <CardDescription>Configure exam parameters for students</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Exam Length (minutes)</Label>
                    <div className="flex items-center gap-4">
                      <Slider value={[examLength]} onValueChange={(v) => handleExamLengthChange(v[0])} min={15} max={180} step={15} className="flex-1" />
                      <span className="w-16 text-right text-sm font-bold">{examLength} min</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Question Types</Label>
                    <Select value={examQuestionTypes} onValueChange={handleExamTypeChange}>
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
                    <Select value={settings.examDifficulty} onValueChange={(v: any) => update({ examDifficulty: v })}>
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
                    <Select value={settings.examPresentation || "all_at_once"} onValueChange={(v: any) => update({ examPresentation: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_at_once">All at once (most realistic)</SelectItem>
                        <SelectItem value="one_by_one">One by one</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">All at once mirrors a real exam format.</p>
                  </div>

                  {/* Estimated Question Count Preview */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium">Estimated Questions</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        {!editingEstimate && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleEditEstimate}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                        )}
                        <Button variant={estimateApproved ? "outline" : "default"} size="sm" className="h-7 text-xs" onClick={handleApproveEstimate}>
                          {estimateApproved ? <><Check className="mr-1 h-3 w-3" /> Approved</> : "Approve"}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Based on {examLength} min, {settings.examDifficulty} difficulty — estimated <span className="font-bold text-foreground">{activeTotal} questions</span>
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
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="quiz">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Daily Quiz Rules</CardTitle>
                  <CardDescription>Configure daily quiz parameters for students</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Number of Questions</Label>
                    <div className="flex items-center gap-4">
                      <Slider value={[quizNumQuestions]} onValueChange={(v) => setQuizNumQuestions(v[0])} min={3} max={20} step={1} className="flex-1" />
                      <span className="w-16 text-right text-sm font-bold">{quizNumQuestions}</span>
                    </div>
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

                  <div className="rounded-lg border bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Note:</strong> Daily quiz difficulty is personalized automatically based on each student's concept mastery level. No manual setting needed.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Student Experience Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4" /> Student Experience Preview</CardTitle>
              <CardDescription>What students will see based on your settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Teaching Assistant Chat</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-primary/10 p-3 text-xs">
                    <p className="font-medium text-primary">Teaching Assistant</p>
                    <p className="mt-1 text-foreground">I can help you understand this concept! Let me break it down step by step...</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">Study Mode</Badge>
                    <Badge variant="outline" className="text-[10px]">Show Steps</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Knowledge: Course materials + web sources
                    {settings.plagiarismWarnings && " · Plagiarism warnings active in exam mode"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exam: {examLength} min · {activeTotal} questions · {settings.examDifficulty} difficulty
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Daily Quiz: {quizTimeLimit} min · {quizNumQuestions} questions · Personalized difficulty
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/syllabus")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSave}>
              Continue to Publish <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITASettings;
