import { useState } from "react";
import { TASettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Clock, Settings2, Info, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

export interface ExamCustomSettings {
  timeLimit: number;
  questionCount: number;
  difficulty: string;
  questionMix: string;
}

interface ExamPrepPanelProps {
  taSettings: TASettings;
  onStart: (settings: ExamCustomSettings) => void;
  onShowDashboard?: () => void;
  /** Number of distinct exams the professor has generated questions for. */
  examCount?: number;
  /** Index (0-based) of the next exam that will be served on the next Start Exam click. */
  nextExamIndex?: number;
}

const ExamPrepPanel = ({ taSettings, onStart, onShowDashboard, examCount = 0, nextExamIndex = 0 }: ExamPrepPanelProps) => {

  const profTime = taSettings.examTimeLimit || 60;
  const profCount = taSettings.examManualQuestions
    ? (taSettings.examManualCount || 20)
    : Math.max(5, Math.round(profTime / 3));

  const [timeLimit, setTimeLimit] = useState(profTime);
  const [questionCount, setQuestionCount] = useState(profCount);
  const [showSettings, setShowSettings] = useState(false);

  const isDefault = timeLimit === profTime && questionCount === profCount;

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

  const noExamAvailable = examCount === 0;
  const upcomingExamPosition = examCount > 0 ? (nextExamIndex % examCount) + 1 : 0;
  const availabilityNote =
    examCount === 0
      ? "Your professor hasn't published a practice exam yet."
      : examCount === 1
        ? "1 practice exam available from your professor — you can retake it as often as you like."
        : `${examCount} practice exams available from your professor — each Start Exam rotates to the next one (next up: Exam ${upcomingExamPosition} of ${examCount}).`;

  return (
    <div className="border-b bg-muted/20 px-5 py-4 space-y-3">
      {/* Availability note about professor-published exams */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">{availabilityNote}</p>
      </div>

      {/* Recommendation banner */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Professor recommended settings</span> — these simulate the real exam. You can customize them for your practice.
        </p>
      </div>


      {/* Summary + Start */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs gap-1">
            <Clock className="h-3 w-3" /> {timeLimit} min
          </Badge>
          <Badge variant="outline" className="text-xs">
            {questionCount} questions
          </Badge>
          {!isDefault && (
            <Badge variant="secondary" className="text-xs">Customized</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            onClick={() => onStart({ timeLimit, questionCount, difficulty: "Mixed", questionMix: "mixed" })}
            className="gap-2"
            disabled={noExamAvailable}
          >
            <Clock className="h-4 w-4" /> Start Exam Practice
          </Button>
          {onShowDashboard && (
            <Button variant="outline" onClick={onShowDashboard} className="gap-2">
              <BarChart3 className="h-4 w-4" /> Performance
            </Button>
          )}
        </div>
      </div>


      {/* Expandable settings */}
      {showSettings && (
        <div className="rounded-lg border bg-background p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Practice Settings</Label>
            {!isDefault && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetToRecommended}>
                Reset to Recommended
              </Button>
            )}
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
    </div>
  );
};

export default ExamPrepPanel;
