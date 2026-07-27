import { TASettings, StudentExamInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Clock,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  FileText,
  Plus,
  ChevronRight,
} from "lucide-react";

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

  const examAvailabilityLine =
    exams.length === 0
      ? "There are no practice exams available to take right now."
      : exams.length === 1
        ? (
          <>
            There is <span className="font-semibold text-foreground">1 practice exam</span> you can take.
          </>
        )
        : (
          <>
            There are <span className="font-semibold text-foreground">{exams.length} practice exams</span> you can take.
          </>
        );

  return (
    <div className="px-5 py-4 space-y-5">
      {/* Welcome hero */}
      <Card className="border bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Exam Prep Mode
              </p>
              <h2 className="font-heading text-2xl font-bold leading-tight">
                Welcome to Exam Prep Mode!
              </h2>
              <p className="text-sm text-muted-foreground">
                Your professor created the following practice exam{exams.length === 1 ? "" : "s"} to simulate the real exam.{" "}
                {examAvailabilityLine}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-heading text-xl font-bold">Practice exams</h3>
          <p className="text-sm text-muted-foreground">
            Complete professor-created simulations and review your performance after each attempt.
          </p>
        </div>
        {onShowDashboard && (
          <Button variant="outline" size="sm" onClick={onShowDashboard} className="h-9 gap-2 shrink-0">
            <BarChart3 className="h-4 w-4" /> Performance
          </Button>
        )}
      </div>

      {/* Exam list */}
      <div className="space-y-3">
        {exams.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-8 text-center">
            <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No practice exams have been published yet. Check back after your professor publishes one.
            </p>
          </div>
        )}

        {exams.map((exam) => {
          const attemptsRemaining = exam.isCompleted ? 0 : 1;
          return (
            <Card key={exam.id} className={exam.isCompleted ? "border-muted bg-muted/20" : "bg-background"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="h-5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 border-0 text-[11px] font-medium px-2">
                          Professor created
                        </Badge>
                        {exam.isCompleted ? (
                          <Badge variant="outline" className="h-5 rounded-full text-[11px] font-medium px-2 gap-1 text-green-700 border-green-200 bg-green-50">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </Badge>
                        ) : !exam.hasQuestions ? (
                          <Badge variant="outline" className="h-5 rounded-full text-[11px] font-medium px-2 gap-1 text-amber-700 border-amber-200 bg-amber-50">
                            <AlertCircle className="h-3 w-3" /> No questions yet
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 rounded-full text-[11px] font-medium px-2">
                            Available
                          </Badge>
                        )}
                      </div>

                      <h4 className="text-base font-semibold truncate">
                        {exam.label || `Exam ${exam.position}`}
                      </h4>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {exam.lengthMin} minutes
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" /> {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} available
                        </span>
                      </div>

                      {exam.isCompleted && exam.bestScore !== null && exam.bestScore !== undefined && (
                        <p className="text-xs font-medium text-foreground">
                          Best score: {Math.round(exam.bestScore * 100)}%
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="h-9 gap-1 shrink-0"
                    onClick={() =>
                      onStart(
                        { timeLimit: profTime, questionCount: profCount, difficulty: "Mixed", questionMix: "mixed" },
                        exam.id,
                      )
                    }
                    disabled={!exam.hasQuestions || exam.isCompleted}
                  >
                    {exam.isCompleted ? "Completed" : (
                      <>
                        Start exam <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ExamPrepPanel;
