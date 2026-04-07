import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTASettings } from "@/hooks/useTASettings";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, ArrowLeft, BookOpen, Calculator, Check, Pencil, Clock, Info, AlertTriangle } from "lucide-react";
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
  const courseId = useTeacherCourseId();
  const { taSettings, loading, saveTASettings } = useTASettings(courseId);
  const navigate = useNavigate();
  const [settings, setSettings] = useState(taSettings);
  const [examLength, setExamLength] = useState(taSettings.examTimeLimit ?? 60);
  const [examQuestionTypes, setExamQuestionTypes] = useState(taSettings.examQuestionMix || "mixed");
  const [editingEstimate, setEditingEstimate] = useState(false);

  const [examApproved, setExamApproved] = useState(taSettings.examApproved ?? false);
  const [examEnabled, setExamEnabled] = useState(taSettings.examEnabled ?? false);
  const [examManualQuestions, setExamManualQuestions] = useState(taSettings.examManualQuestions ?? false);
  const [examManualCount, setExamManualCount] = useState(taSettings.examManualCount ?? 5);

  const estimate = useMemo(() => questionEstimate(examLength, examQuestionTypes, settings.examDifficulty), [examLength, examQuestionTypes, settings.examDifficulty]);
  const [customBreakdown, setCustomBreakdown] = useState<Record<string, number>>(estimate.breakdown);
  const [estimateApproved, setEstimateApproved] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSettings(taSettings);
      setExamLength(taSettings.examTimeLimit ?? 60);
      setExamQuestionTypes(taSettings.examQuestionMix || "mixed");
      setExamApproved(taSettings.examApproved ?? false);
      setExamEnabled(taSettings.examEnabled ?? false);
      setExamManualQuestions(taSettings.examManualQuestions ?? false);
      setExamManualCount(taSettings.examManualCount ?? estimate.total);
    }
  }, [loading, taSettings]);

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

  const canContinue = examApproved;

  const handleSave = async () => {
    try {
      await saveTASettings({
        ...settings,
        examTimeLimit: examLength,
        examQuestionMix: examQuestionTypes,
        examPresentation: "all_at_once",
        examApproved,
        examEnabled,
        examManualQuestions,
        examManualCount,
      });
      navigate("/teacher/setup/publish");
    } catch {
      toast.error("Failed to save exam settings. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={7} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Exam <span className="text-primary">Mode</span></h1>
          <p className="text-muted-foreground">Configure exam simulation rules for your students</p>
        </div>

        <div className="space-y-6">
          {/* Recommendation banner */}
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">These rules are recommendations only</p>
              <p>Students can still adjust exam settings (time limit, question count) if they choose. Your configuration serves as the recommended default.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Custom questions:</span> You can add your own custom exam questions later from the Assessments tab after completing setup.
            </p>
          </div>

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
                <Button variant={examApproved ? "outline" : "default"} size="sm" onClick={() => {
                  const next = !examApproved;
                  setExamApproved(next);
                  if (next && !examEnabled) setExamEnabled(true);
                }}>
                  {examApproved ? <><Check className="mr-1 h-4 w-4" /> Approved</> : "Approve"}
                </Button>
              </div>

            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/ai-settings")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex flex-col items-end gap-1">
              <Button onClick={handleSave} disabled={!canContinue}>
                Continue to Publish <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {!canContinue && (
                <p className="text-xs text-destructive">Please approve exam rules to continue</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamMode;
