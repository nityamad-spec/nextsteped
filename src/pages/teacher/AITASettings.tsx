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
import { ArrowRight, ArrowLeft, Eye, MessageSquare, BookOpen, Calculator, Check, Pencil } from "lucide-react";
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
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix?.includes("MCQ") ? "mixed" : "mixed");
  const [editingEstimate, setEditingEstimate] = useState(false);

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
    if (editingEstimate) {
      setEditingEstimate(false);
    }
    setEstimateApproved(true);
  };

  const handleEditEstimate = () => {
    setCustomBreakdown({ ...estimate.breakdown });
    setEditingEstimate(true);
    setEstimateApproved(false);
  };

  const handleSave = () => {
    setTASettings({ ...settings, examTimeLimit: examLength, examQuestionMix: examQuestionTypes });
    navigate("/teacher/setup/publish");
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={4} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Teaching Assistant Settings</h1>
          <p className="text-muted-foreground">Configure how the AI Teaching Assistant interacts with your students</p>
        </div>

        <div className="space-y-6">
          {/* Knowledge Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Knowledge Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-sm font-medium">Where should the AI pull answers from?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => update({ knowledgeSources: "uploaded" })}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${settings.knowledgeSources === "uploaded" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <span className="font-medium">Uploaded Docs Only</span>
                  <p className="mt-1 text-xs text-muted-foreground">AI answers only from your course materials</p>
                </button>
                <button
                  onClick={() => update({ knowledgeSources: "uploaded_and_web" })}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${settings.knowledgeSources === "uploaded_and_web" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Uploaded + Web Sources</span>
                    <Badge className="text-[10px]">Recommended</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Supplements with reputable external resources</p>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Exam Simulation Rules */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exam Simulation Rules</CardTitle>
              <CardDescription>Configure exam parameters that students can use as a pre-defined format</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Exam Length (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[examLength]}
                    onValueChange={(v) => handleExamLengthChange(v[0])}
                    min={15}
                    max={180}
                    step={15}
                    className="flex-1"
                  />
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
                    <Button
                      variant={estimateApproved ? "outline" : "default"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleApproveEstimate}
                    >
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
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-16 text-xs text-right"
                          value={count}
                          onChange={(e) => setCustomBreakdown(prev => ({ ...prev, [type]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        />
                      ) : (
                        <span className="text-sm font-bold">{count}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

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
                    <Badge variant="outline" className="text-[10px]">Ask for Hint</Badge>
                    <Badge variant="outline" className="text-[10px]">Show Steps</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Knowledge: {settings.knowledgeSources === "uploaded" ? "Course materials only" : "Course materials + web sources"}
                    {settings.plagiarismWarnings && " · Plagiarism warnings active in exam mode"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exam format: {examLength} min · {activeTotal} questions · {settings.examDifficulty} difficulty
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
