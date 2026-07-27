import { useState } from "react";
import { TASettings, StudentExamInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Settings2, Info, ChevronDown, ChevronUp, BarChart3, CheckCircle2, AlertCircle, PlayCircle } from "lucide-react";

export interface ExamCustomSettings {
  timeLimit: number;
  questionCount: number;
  difficulty: string;
  questionMix: string;
}

interface ExamPrepPanelProps {
  taSettings: TASettings;
  onStart: (settings: ExamCustomSettings, examId: string) => void;
  onShowDashboard?: () => void;
  /** List of published practice exams for this course. */
  exams?: StudentExamInfo[];
}

const ExamPrepPanel = ({ taSettings, onStart, onShowDashboard, exams = [] }: ExamPrepPanelProps) => {

  const profTime = taSettings.examTimeLimit || 60;
  const profCount = taSettings.examManualQuestions
    ? (taSettings.examManualCount || 20)
    : Math.max(5, Math.round(profTime / 3));

  const [timeLimit, setTimeLimit] = useState(profTime);
  const [questionCount, setQuestionCount] = useState(profCount);
  const [showSettings, setShowSettings] = useState(false);

  const resetToRecommended = () => {
    setTimeLimit(profTime);
    setQuestionCount(profCount);
  };

  const handleQuestionCountChange = (value: string) => {
    if (value === "") {
      setQuestionCount(0);
      return;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    setQuestionCount(Math.max(1, Math.min(100, parsed)));
  };

  const noExamAvailable = exams.length === 0;
  const completedCount = exams.filter((e) => e.isCompleted).length;
  const examAvailabilityLine =
    exams.length === 0
      ? "There are no practice exams available to take right now."
      : exams.length === 1
        ? "There is 1 practice exam you can take."
        : `There are ${exams.length} practice exams you can take.`;


  return (
    <div className="border-b bg-muted/20 px-5 py-4 space-y-4">
      {/* Combined professor recommendation + availability note */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Professor Recommended Settings: These simulate the exam.</span>
          {" "}{examAvailabilityLine}
          {completedCount > 0 && (
            <span className="block mt-1">
              You have completed {completedCount} of {exams.length} exam{exams.length === 1 ? "" : "s"}.
            </span>
          )}
        </p>
      </div>


      {/* Global action bar */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => setShowSettings(!showSettings)}
          disabled
          title="Settings are fixed by your professor"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {showSettings ? "Hide" : "Edit"} Settings
          {showSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        {onShowDashboard && (
          <Button variant="outline" size="sm" onClick={onShowDashboard} className="h-8 gap-2">
            <BarChart3 className="h-4 w-4" /> Performance
          </Button>
        )}
      </div>


      {/* Expandable settings */}
      {showSettings && (
        <div className="rounded-lg border bg-background p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Practice Settings</Label>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetToRecommended}>
              Reset to Recommended
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Time Limit
                {timeLimit !== profTime && (
                  <span className="ml-1 text-primary">(recommended: {profTime} min)</span>
                )}
              </Label>
              <div className="flex items-center gap-4">
                <Slider value={[timeLimit]} onValueChange={(v) => setTimeLimit(v[0])} min={10} max={180} step={10} className="flex-1" />
                <span className="w-16 text-right text-sm font-bold">{timeLimit} min</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Number of Questions
                {questionCount !== profCount && (
                  <span className="ml-1 text-primary">(recommended: {profCount})</span>
                )}
              </Label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount === 0 ? "" : questionCount}
                  onChange={(e) => handleQuestionCountChange(e.target.value)}
                  className="max-w-[140px]"
                />
                <span className="text-xs text-muted-foreground">Enter how many questions you want.</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Exam list */}
      <div className="space-y-2">
        {exams.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center">
            <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No practice exams have been published yet. Check back after your professor publishes one.
            </p>
          </div>
        )}

        {exams.map((exam) => (
          <Card key={exam.id} className={exam.isCompleted ? "border-muted bg-muted/20" : "bg-background"}>
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold truncate">{exam.label || `Exam ${exam.position}`}</h4>
                    {exam.isCompleted && (
                      <Badge variant="default" className="text-[10px] h-5 gap-1 bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </Badge>
                    )}
                    {!exam.hasQuestions && !exam.isCompleted && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1 text-amber-600 border-amber-200 bg-amber-50">
                        <AlertCircle className="h-3 w-3" /> No questions yet
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {exam.lengthMin} min
                    </span>
                    <span className="flex items-center gap-1">
                      <PlayCircle className="h-3 w-3" /> {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
                    </span>
                    {exam.isCompleted && exam.bestScore !== null && exam.bestScore !== undefined && (
                      <span className="font-medium text-foreground">
                        Best score: {Math.round(exam.bestScore * 100)}%
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => onStart({ timeLimit, questionCount, difficulty: "Mixed", questionMix: "mixed" }, exam.id)}
                  disabled={!exam.hasQuestions || exam.isCompleted}
                >
                  {exam.isCompleted ? "Completed" : "Start Exam"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ExamPrepPanel;
