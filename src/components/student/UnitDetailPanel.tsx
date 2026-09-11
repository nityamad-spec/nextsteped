import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Code2,
  Lock,
  PenLine,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { READINESS_THRESHOLD } from "@/hooks/useUnitReadiness";
import type { UnitConceptMastery } from "@/hooks/useUnitReadiness";
import { computeUnitStage } from "@/lib/unitStage";
import { getMasteryLevel, MASTERY_LABEL, MASTERY_SWATCH_CLASS } from "@/lib/masteryLevels";
import type { LearningPlanWeek } from "@/hooks/useLearningPlan";
import { languageLabel, type PublishedCodingExercise } from "@/lib/codingExercises";

export type UnitResource = LearningPlanWeek["resources"][number];

export interface UnitDetailPanelProps {
  unitNumber: number;
  topic: string;
  totalUnits: number;
  studied: boolean;
  practised: boolean;
  quizTaken: boolean;
  isCodingWeek?: boolean;
  exercises?: PublishedCodingExercise[];
  completedExerciseIds?: ReadonlySet<string>;
  onOpenExercise?: (exercise: PublishedCodingExercise) => void;
  quizScore?: number;
  quizAvailable: boolean;
  quizLocked: boolean;
  quizFinalAttempt?: boolean;
  readiness: number;
  weakConcepts: string[];
  concepts?: UnitConceptMastery[];
  onStudyConcept?: (concept: string, isWeak: boolean) => void;
  resources: UnitResource[];
  activityDone: Record<string, boolean>;
  onToggleActivity: (id: string) => void;
  onStudy: () => void;
  onPractice: () => void;
  onTakeQuiz: () => void;
  onGoToNextUnit?: () => void;
  practiceViaTerminal?: boolean;
}

type StepState = "done" | "active" | "todo" | "locked";

const StepCard = ({
  index,
  icon: Icon,
  title,
  status,
  state,
  onClick,
}: {
  index: number;
  icon: typeof BookOpen;
  title: string;
  status: string;
  state: StepState;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`flex flex-1 flex-col gap-1.5 rounded-xl border bg-card p-4 text-left transition-colors disabled:cursor-default ${
      onClick ? "hover:bg-muted/40" : ""
    } ${state === "done" ? "border-emerald-500/30" : ""}`}
  >
    <div className="flex items-center gap-2">
      {state === "done" ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : state === "locked" ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground">
          <Lock className="h-3 w-3" />
        </span>
      ) : (
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
            state === "active" ? "border-primary text-primary" : "text-muted-foreground"
          }`}
        >
          {index}
        </span>
      )}
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold">{title}</span>
    </div>
    <p className="text-xs text-muted-foreground">{status}</p>
  </button>
);

const Collapsible = ({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <span className="text-sm font-semibold">
          {title}
          {meta && <span className="ml-2 text-xs font-normal text-muted-foreground">{meta}</span>}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

const UnitDetailPanel = ({
  unitNumber,
  topic,
  totalUnits,
  studied,
  practised,
  quizTaken,
  isCodingWeek = false,
  exercises = [],
  completedExerciseIds,
  onOpenExercise,
  quizScore,
  quizAvailable,
  quizLocked,
  quizFinalAttempt,
  readiness,
  weakConcepts,
  concepts = [],
  onStudyConcept,
  resources,
  activityDone,
  onToggleActivity,
  onStudy,
  onPractice,
  onTakeQuiz,
  onGoToNextUnit,
  practiceViaTerminal = false,
}: UnitDetailPanelProps) => {
  const [showExercises, setShowExercises] = useState(false);
  const stage = computeUnitStage({ studied, practised, quizTaken, readiness, quizExempt: isCodingWeek });
  const ready = stage === "ready";
  const isLastUnit = unitNumber >= totalUnits;
  const weakList = weakConcepts.slice(0, 2).join(", ");
  const practiceCta = practiceViaTerminal ? "Open code terminal" : "Start practice";
  const visibleResources = isCodingWeek ? [] : resources;
  const readingsDone = visibleResources.filter((r) => activityDone[r.id]).length;
  const weakSet = new Set(weakConcepts);
  const exercisesDone = exercises.filter((e) => completedExerciseIds?.has(e.id)).length;

  // One next move: headline, one line of copy, one button.
  let moveTitle = "Start studying";
  let moveBody = isCodingWeek
    ? "Work through this unit with your tutor, then practise it hands-on in the code terminal."
    : "Work through this unit with your tutor, practise a few questions, then take the weekly quiz.";
  let moveAction = "Start studying";
  let moveOnClick = onStudy;

  if (stage === "studied") {
    moveTitle = practiceViaTerminal ? "Practise in the code terminal" : "Do practice questions";
    moveBody = "You've studied this unit — now check what stuck. Practice raises your mastery.";
    moveAction = practiceCta;
    moveOnClick = onPractice;
  } else if (stage === "practised") {
    if (isCodingWeek) {
      moveTitle = "Keep practising";
      moveBody = `This coding/lab unit has no quiz — practice lifts your mastery toward ${READINESS_THRESHOLD}%.`;
      moveAction = practiceCta;
      moveOnClick = onPractice;
    } else {
      moveTitle = `Take the Unit ${unitNumber} quiz`;
      moveBody = "You've studied and practised. One scored attempt sets your mastery for this unit.";
      moveAction = "Take quiz";
      moveOnClick = onTakeQuiz;
    }
  } else if (stage === "needs_work") {
    moveTitle = "Keep practicing to raise your mastery";
    moveBody = `Your quiz is done${typeof quizScore === "number" ? ` (${quizScore}%)` : ""}, but practice keeps lifting your mastery toward ${READINESS_THRESHOLD}%.${
      weakList ? ` Focus on ${weakList}.` : ""
    }`;
    moveAction = practiceCta;
    moveOnClick = onPractice;
  } else if (ready) {
    moveTitle = isLastUnit ? "You've finished the course path" : `Go to Unit ${unitNumber + 1}`;
    moveBody = "This unit is complete. Study and practice stay open if you want to push mastery higher.";
    moveAction = isLastUnit ? "Keep practising" : `Go to Unit ${unitNumber + 1}`;
    moveOnClick = isLastUnit ? onPractice : (onGoToNextUnit ?? onPractice);
  }

  const quizStepState: StepState = quizTaken || quizLocked ? (ready ? "done" : "locked") : "todo";

  return (
    <div
      className={`rounded-2xl border p-5 ${
        ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-primary/30 bg-primary/5"
      }`}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
              ready ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
            }`}
          >
            {ready ? <Check className="h-6 w-6" strokeWidth={3} /> : unitNumber}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unit {unitNumber}
              </p>
              <Badge variant="secondary" className="text-[10px]">
                Teaching
              </Badge>
              {isCodingWeek && (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                >
                  <Code2 className="h-2.5 w-2.5" /> Coding Lab
                </Badge>
              )}
            </div>
            <h2 className="truncate font-heading text-lg font-bold md:text-xl">{topic}</h2>
          </div>
        </div>

        {/* The only percentage on screen */}
        <div className="w-full max-w-[220px]">
          <p className="mb-1 text-right text-sm">
            <span className="font-bold">{readiness}% mastery</span>
            <span className="ml-1 text-xs text-muted-foreground">goal {READINESS_THRESHOLD}%</span>
          </p>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${Math.max(0, Math.min(100, readiness))}%` }}
            />
            <span
              aria-hidden
              className="absolute inset-y-0 w-0.5 bg-foreground/40"
              style={{ left: `${READINESS_THRESHOLD}%` }}
            />
          </div>
        </div>
      </div>

      {/* Your next move */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="min-w-[240px] flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your next move</p>
          <p className="mt-1 font-heading text-base font-bold">{moveTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{moveBody}</p>
        </div>
        <Button size="lg" onClick={moveOnClick}>
          {moveAction}
          {ready && !isLastUnit && <ArrowRight className="ml-1.5 h-4 w-4" />}
        </Button>
      </div>

      {/* Three steps */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Your path for this unit
      </p>
      <div className="flex flex-col gap-3 md:flex-row">
        <StepCard
          index={1}
          icon={BookOpen}
          title="Study"
          state={studied ? "done" : stage === "not_started" ? "active" : "todo"}
          status={studied ? "Done — worked through with the tutor." : "Learn this unit's concepts with your tutor."}
          onClick={onStudy}
        />
        <StepCard
          index={2}
          icon={practiceViaTerminal ? Terminal : PenLine}
          title="Practice"
          state={practised ? (ready ? "done" : "active") : stage === "studied" || stage === "needs_work" ? "active" : "todo"}
          status={
            practised
              ? ready
                ? "Done — mastery goal reached."
                : "In progress — raises your mastery."
              : practiceViaTerminal
                ? "Practise hands-on in the code terminal."
                : "Answer scored practice questions."
          }
          onClick={onPractice}
        />
        {isCodingWeek ? (
          <StepCard
            index={3}
            icon={Code2}
            title="Coding Exercises"
            state={exercises.length > 0 && exercisesDone >= exercises.length ? "done" : "todo"}
            status={
              exercises.length === 0
                ? "No exercises published yet."
                : `${exercisesDone} of ${exercises.length} done — tap to see them.`
            }
            onClick={exercises.length > 0 ? () => setShowExercises((v) => !v) : undefined}
          />
        ) : (
          <StepCard
            index={3}
            icon={ClipboardCheck}
            title="Weekly Quiz"
            state={quizStepState}
            status={
              quizTaken
                ? `Scored ${typeof quizScore === "number" ? `${quizScore}%` : "—"}. One attempt only — locked.`
                : quizLocked
                  ? "Locked — ask your professor to unlock it."
                  : quizAvailable
                    ? quizFinalAttempt
                      ? "One final attempt left."
                      : "One scored attempt."
                    : "Not published for this unit yet."
            }
            onClick={quizTaken || quizLocked || !quizAvailable ? undefined : onTakeQuiz}
          />
        )}
      </div>

      {isCodingWeek && showExercises && exercises.length > 0 && (
        <div className="mt-3 space-y-2">
          {exercises.map((ex) => {
            const done = completedExerciseIds?.has(ex.id) ?? false;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => onOpenExercise?.(ex)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Code2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{ex.title}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {languageLabel(ex.language)}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* Compact sub-sections */}
      {(concepts.length > 0 || visibleResources.length > 0) && (
        <div className="mt-3 space-y-2">
          {concepts.length > 0 && (
            <Collapsible title="Concepts" meta={`${concepts.length}`}>
              <div className="grid gap-2 sm:grid-cols-2">
                {concepts.map((c) => {
                  const level = getMasteryLevel(c.matched && c.mastery > 0 ? 1 : 0, c.mastery / 100);
                  const isWeak = weakSet.has(c.name);
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => onStudyConcept?.(c.name, isWeak)}
                      disabled={!onStudyConcept}
                      className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${MASTERY_SWATCH_CLASS[level]}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {level === "not_explored" ? MASTERY_LABEL[level] : `${c.mastery}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Collapsible>
          )}

          {visibleResources.length > 0 && (
            <Collapsible title="Readings" meta={`${readingsDone} / ${visibleResources.length}`}>
              <div className="space-y-1.5">
                {visibleResources.map((r) => {
                  const hasUrl = typeof r.url === "string" && r.url.length > 0;
                  const done = !!activityDone[r.id];
                  const inner = (
                    <>
                      <button
                        type="button"
                        aria-label={done ? "Mark as not done" : "Mark as done"}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleActivity(r.id);
                        }}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          done
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "border-muted-foreground/30 bg-background text-transparent hover:border-muted-foreground/60 hover:text-muted-foreground"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            done ? "text-muted-foreground line-through" : hasUrl ? "text-primary group-hover:underline" : ""
                          }`}
                        >
                          {r.title}
                        </p>
                        {(r.action || r.description) && (
                          <p className="text-xs text-muted-foreground">{r.action || r.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {r.type}
                      </Badge>
                    </>
                  );
                  return hasUrl ? (
                    <a
                      key={r.id}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-lg bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg bg-muted/20 p-2.5">
                      {inner}
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
};

export default UnitDetailPanel;
