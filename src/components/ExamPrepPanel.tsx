import { useState } from "react";
import { TASettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock, Settings2, Info, ChevronDown, ChevronUp } from "lucide-react";

export interface ExamCustomSettings {
  timeLimit: number;
  questionCount: number;
  difficulty: string;
  questionMix: string;
}

interface ExamPrepPanelProps {
  taSettings: TASettings;
  onStart: (settings: ExamCustomSettings) => void;
}

const ExamPrepPanel = ({ taSettings, onStart }: ExamPrepPanelProps) => {
  const profTime = taSettings.examTimeLimit || 60;
  const profCount = taSettings.examManualQuestions
    ? (taSettings.examManualCount || 20)
    : Math.max(5, Math.round(profTime / 3));
  const profDifficulty = taSettings.examDifficulty || "Mixed";
  const profMix = taSettings.examQuestionMix || "mixed";

  const [timeLimit, setTimeLimit] = useState(profTime);
  const [questionCount, setQuestionCount] = useState(profCount);
  const [difficulty, setDifficulty] = useState(profDifficulty);
  const [questionMix, setQuestionMix] = useState(profMix);
  const [showSettings, setShowSettings] = useState(false);

  const isDefault = timeLimit === profTime && questionCount === profCount && difficulty === profDifficulty && questionMix === profMix;

  const resetToRecommended = () => {
    setTimeLimit(profTime);
    setQuestionCount(profCount);
    setDifficulty(profDifficulty);
    setQuestionMix(profMix);
  };

  const mixLabels: Record<string, string> = {
    mixed: "Mixed (MCQ + Short Answer + Problem Solving)",
    mcq_only: "Multiple Choice Only",
    short_answer: "Short Answer Only",
    problem_solving: "Problem Solving Only",
    mcq_short: "MCQ + Short Answer",
    mcq_problem: "MCQ + Problem Solving",
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
          <Badge variant="outline" className="text-xs">
            {difficulty}
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
            onClick={() => onStart({ timeLimit, questionCount, difficulty, questionMix })}
            className="gap-2"
            disabled={!taSettings.examEnabled}
          >
            <Clock className="h-4 w-4" /> Start Exam Practice
          </Button>
        </div>
      </div>

      {!taSettings.examEnabled && (
        <p className="text-xs text-muted-foreground text-center">
          Your professor has not enabled the exam yet.
        </p>
      )}

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

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Difficulty
                {difficulty !== profDifficulty && (
                  <span className="ml-1 text-primary">(recommended: {profDifficulty})</span>
                )}
              </Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                  <SelectItem value="Mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Question Types
                {questionMix !== profMix && (
                  <span className="ml-1 text-primary">(recommended: {mixLabels[profMix] || profMix})</span>
                )}
              </Label>
              <Select value={questionMix} onValueChange={setQuestionMix}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(mixLabels).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamPrepPanel;
