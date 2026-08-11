import { BookOpen, PenLine, ClipboardCheck, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { READINESS_THRESHOLD } from "@/hooks/useUnitReadiness";

export interface UnitFocusCardProps {
  unitNumber: number;
  topic: string;
  totalUnits: number;
  quizTaken: boolean;
  quizAvailable: boolean;
  quizLocked: boolean;
  readiness: number;
  weakConcepts: string[];
  onStudy: () => void;
  onPractice: () => void;
  onTakeQuiz: () => void;
  onGoToNextUnit?: () => void;
}

const StepCard = ({
  index,
  icon: Icon,
  title,
  description,
  action,
  onAction,
  done,
  disabled,
}: {
  index: number;
  icon: typeof BookOpen;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  done?: boolean;
  disabled?: boolean;
}) => (
  <div className="flex flex-1 flex-col gap-3 rounded-xl border bg-card p-4">
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {index}
      </span>
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold">{title}</span>
      {done && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    {action && (
      <Button
        size="sm"
        variant={done ? "outline" : "secondary"}
        className="mt-auto w-full"
        onClick={onAction}
        disabled={disabled}
      >
        {disabled && <Lock className="mr-1.5 h-3.5 w-3.5" />}
        {action}
      </Button>
    )}
  </div>
);

const UnitFocusCard = ({
  unitNumber,
  topic,
  totalUnits,
  quizTaken,
  quizAvailable,
  quizLocked,
  readiness,
  weakConcepts,
  onStudy,
  onPractice,
  onTakeQuiz,
  onGoToNextUnit,
}: UnitFocusCardProps) => {
  const ready = quizTaken && readiness >= READINESS_THRESHOLD;
  const weakList = weakConcepts.slice(0, 2).join(", ");
  const isLastUnit = unitNumber >= totalUnits;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardContent className="space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unit {unitNumber}
            </p>
            <h2 className="truncate font-heading text-lg font-bold">{topic}</h2>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              ready
                ? "bg-primary/10 text-primary"
                : quizTaken
                  ? "bg-muted text-muted-foreground"
                  : "bg-accent text-accent-foreground"
            }`}
          >
            {quizTaken ? `${readiness}% readiness${ready ? " · Ready" : ""}` : "Quiz due"}
          </span>
        </div>

        {/* Your next move */}
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your next move
          </p>
          {!quizTaken && (
            <>
              <p className="mt-1 font-heading text-base font-bold">Start studying</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Work through this unit with your teaching assistant, practise a few questions, then take
                the weekly quiz.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={onStudy}>
                  Start studying
                </Button>
                <Button size="sm" variant="outline" onClick={onTakeQuiz} disabled={!quizAvailable || quizLocked}>
                  Take quiz now
                </Button>
              </div>
            </>
          )}
          {quizTaken && !ready && (
            <>
              <p className="mt-1 font-heading text-base font-bold">Study and practice</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your weekly quiz is done, but readiness is below {READINESS_THRESHOLD}%. Scored practice
                keeps raising it{weakList ? ` — start with ${weakList}.` : "."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={onStudy}>
                  Start studying
                </Button>
                <Button size="sm" variant="outline" onClick={onPractice}>
                  Start practice
                </Button>
              </div>
            </>
          )}
          {ready && (
            <>
              <p className="mt-1 font-heading text-base font-bold">
                {isLastUnit ? "You've finished the course path" : `Move on to Unit ${unitNumber + 1}`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You're ready to proceed. Study and practice stay open if you want to push readiness higher.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!isLastUnit && onGoToNextUnit && (
                  <Button size="sm" onClick={onGoToNextUnit}>
                    Go to Unit {unitNumber + 1}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onPractice}>
                  Keep practising
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Path */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {quizTaken ? "Improve your readiness" : "This unit's path"}
          </p>
          <div className="flex flex-col gap-3 md:flex-row">
            <StepCard
              index={1}
              icon={BookOpen}
              title={quizTaken ? "Study weak concepts" : "Study"}
              description={
                quizTaken && weakList
                  ? `Go deeper on ${weakList} with your teaching assistant.`
                  : "Learn this unit's concepts with your teaching assistant."
              }
              action="Start studying"
              onAction={onStudy}
            />
            <StepCard
              index={2}
              icon={PenLine}
              title={quizTaken ? "Complete scored practice" : "Practice"}
              description="Answer AI-generated practice questions. These count towards your readiness."
              action="Start practice"
              onAction={onPractice}
            />
            {!quizTaken && (
              <StepCard
                index={3}
                icon={ClipboardCheck}
                title="Weekly Quiz"
                description="One scored attempt that sets your starting readiness for this unit."
                action={quizLocked ? "Locked" : "Take quiz"}
                onAction={onTakeQuiz}
                disabled={!quizAvailable || quizLocked}
              />
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {quizTaken
              ? "Weekly Quiz completed · one attempt only"
              : "Quiz can only be taken once. After the quiz, Study and Practice stay available."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default UnitFocusCard;
