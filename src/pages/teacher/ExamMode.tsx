import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, BookOpen, Calculator, Check, Pencil, Clock, ClipboardList, Info } from "lucide-react";
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

const ExamMode = () => {
  const { taSettings, setTASettings } = useApp();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(taSettings);
  const [examLength, setExamLength] = useState(taSettings.examTimeLimit || 60);
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix || "mixed");
  const [editingEstimate, setEditingEstimate] = useState(false);

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

  const handleExamLengthChange = (v: number) => { setExamLength(v); setEstimateApproved(false); };
  const handleExamTypeChange = (v: string) => { setExamQuestionTypes(v); setEstimateApproved(false); };

  const activeBreakdown = editingEstimate ? customBreakdown : estimate.breakdown;
  const activeTotal = Object.values(activeBreakdown).reduce((s, n) => s + n, 0);

  const handleApproveEstimate = () => { if (editingEstimate) setEditingEstimate(false); setEstimateApproved(true); };
  const handleEditEstimate = () => { setCustomBreakdown({ ...estimate.breakdown }); setEditingEstimate(true); setEstimateApproved(false); };

  const [examApproved, setExamApproved] = useState(false);
  const [quizApproved, setQuizApproved] = useState(false);
  const [examManualQuestions, setExamManualQuestions] = useState(false);
  const [examManualCount, setExamManualCount] = useState(estimate.total);

  const canContinue = examApproved && quizApproved;

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

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={7} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Exam <span className="text-primary">Mode</span></h1>
          <p className="text-muted-foreground">Configure exam simulation and daily quiz rules for your students</p>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Custom questions:</span> You can add your own custom exam and quiz questions later from the Assessments tab after completing setup. The rules below configure how the AI generates and presents questions to students.
            </p>
          </div>

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

                  <div className={`flex items-center justify-between rounded-lg border p-4 ${examApproved ? "border-primary/30 bg-primary/5" : ""}`}>
                    <div>
                      <p className="text-sm font-medium">Approve Exam Rules</p>
                      <p className="text-xs text-muted-foreground">You must approve exam settings before publishing</p>
                    </div>
                    <Button variant={examApproved ? "outline" : "default"} size="sm" onClick={() => setExamApproved(!examApproved)}>
                      {examApproved ? <><Check className="mr-1 h-4 w-4" /> Approved</> : "Approve"}
                    </Button>
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

              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">Standardized quizzes:</strong> Daily quizzes are <strong>not adaptive</strong>. All students receive the same questions for each day.</p>
                  <p>Questions are assigned to <strong>Day 1</strong> or <strong>Day 2</strong> in the Assessments tab after setup.</p>
                </div>
              </div>

                  <div className={`flex items-center justify-between rounded-lg border p-4 ${quizApproved ? "border-primary/30 bg-primary/5" : ""}`}>
                    <div>
                      <p className="text-sm font-medium">Approve Daily Quiz Rules</p>
                      <p className="text-xs text-muted-foreground">You must approve quiz settings before publishing</p>
                    </div>
                    <Button variant={quizApproved ? "outline" : "default"} size="sm" onClick={() => setQuizApproved(!quizApproved)}>
                      {quizApproved ? <><Check className="mr-1 h-4 w-4" /> Approved</> : "Approve"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/settings")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex flex-col items-end gap-1">
              <Button onClick={handleSave} disabled={!canContinue}>
                Continue to Publish <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {!canContinue && (
                <p className="text-xs text-destructive">Please approve both exam and daily quiz rules to continue</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamMode;
