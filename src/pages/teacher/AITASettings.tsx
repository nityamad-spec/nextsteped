import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { defaultStudyPrompt, defaultExamPrompt } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Eye, MessageSquare, BookOpen, Calculator, Check, Pencil, Clock, ClipboardList, Info } from "lucide-react";
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
  const [studyPrompt, setStudyPrompt] = useState(taSettings.studySystemPrompt || defaultStudyPrompt);
  const [examPrompt, setExamPrompt] = useState(taSettings.examSystemPrompt || defaultExamPrompt);

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
      studySystemPrompt: studyPrompt,
      examSystemPrompt: examPrompt,
    });
    navigate("/teacher/setup/publish");
  };

  const canContinue = examApproved && quizApproved;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={5} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Teaching Assistant Settings</h1>
          <p className="text-muted-foreground">Configure how the AI Teaching Assistant interacts with your students</p>
        </div>

        <div className="space-y-6">
          {/* Note about custom questions */}
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Custom questions:</span> You can add your own custom exam and quiz questions later from the Assessments tab after completing setup. The rules below configure how the AI generates and presents questions to students.
            </p>
          </div>

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

                  {/* Exam Length */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Exam Length (minutes)</Label>
                    <div className="flex items-center gap-4">
                      <Slider value={[examLength]} onValueChange={(v) => { handleExamLengthChange(v[0]); setExamApproved(false); }} min={15} max={180} step={15} className="flex-1" />
                      <span className="w-16 text-right text-sm font-bold">{examLength} min</span>
                    </div>
                  </div>

                  {/* Question Count: Estimated or Manual */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium">Number of Questions</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={examManualQuestions ? "default" : "outline"}
                          size="sm" className="h-7 text-xs"
                          onClick={() => { setExamManualQuestions(!examManualQuestions); setExamApproved(false); }}
                        >
                          {examManualQuestions ? "Manual" : "Estimated"}
                        </Button>
                      </div>
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

                  {/* Approve Exam Rules */}
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

                  <div className="rounded-lg border bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Note:</strong> Daily quiz difficulty is personalized automatically based on each student's concept mastery level. No manual setting needed.
                    </p>
                  </div>

                  {/* Approve Quiz Rules */}
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

          {/* AI System Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" /> AI System Instructions</CardTitle>
              <CardDescription>Customize how the AI Teaching Assistant behaves with your students. These prompts control the AI's personality, rules, and teaching approach.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Study Mode Instructions</Label>
                <Textarea
                  value={studyPrompt}
                  onChange={(e) => setStudyPrompt(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder="Instructions for how the AI behaves in Study mode..."
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Controls AI behavior when students are studying and asking questions.</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStudyPrompt(defaultStudyPrompt)}>
                    Reset to Default
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Exam Prep Mode Instructions</Label>
                <Textarea
                  value={examPrompt}
                  onChange={(e) => setExamPrompt(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder="Instructions for how the AI behaves in Exam Prep mode..."
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Controls AI behavior during exam preparation and practice questions.</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExamPrompt(defaultExamPrompt)}>
                    Reset to Default
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

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
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/diagnostic")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSave} disabled={!canContinue}>
              Continue to Publish <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {!canContinue && (
              <p className="text-xs text-destructive mt-1 text-right">Please approve both exam and daily quiz rules to continue</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITASettings;
