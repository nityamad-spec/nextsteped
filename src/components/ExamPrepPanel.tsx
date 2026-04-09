import { useState } from "react";
import { TASettings } from "@/types";
import { Button } from "@/components/ui/button";
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
}

const ExamPrepPanel = ({ taSettings, onStart, onShowDashboard }: ExamPrepPanelProps) => {
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

  return (
    <div className="border-b bg-muted/20 px-5 py-4 space-y-3">
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
          >
            <Settings2 className="h-3.5 w-3.5" />
            {showSettings ? "Hide" : "Edit"} Settings
            {showSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button
            onClick={() => onStart({ timeLimit, questionCount, difficulty: "Mixed", questionMix: "mixed" })}
            className="gap-2"
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
                <Slider value={[timeLimit]} onValueChange={(v) => setTimeLimit(v[0])} min={15} max={180} step={15} className="flex-1" />
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
                <Slider value={[questionCount]} onValueChange={(v) => setQuestionCount(v[0])} min={5} max={100} step={1} className="flex-1" />
                <span className="w-16 text-right text-sm font-bold">{questionCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamPrepPanel;
