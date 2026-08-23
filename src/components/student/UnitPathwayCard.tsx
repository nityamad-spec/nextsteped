import { useState } from "react";
import {
  BookOpen,
  PenLine,
  ClipboardCheck,
  ArrowRight,
  CheckCircle2,
  Lock,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { READINESS_THRESHOLD } from "@/hooks/useUnitReadiness";
import type { UnitConceptMastery } from "@/hooks/useUnitReadiness";
import { computeUnitStage } from "@/lib/unitStage";
import {
  getMasteryLevel,
  MASTERY_LABEL,
  MASTERY_SWATCH_CLASS,
} from "@/lib/masteryLevels";

import type { LearningPlanWeek } from "@/hooks/useLearningPlan";
import { languageLabel, type PublishedCodingExercise } from "@/lib/codingExercises";

export type UnitResource = LearningPlanWeek["resources"][number];

export interface UnitPathwayCardProps {
  unitNumber: number;
  topic: string;
  totalUnits: number;
  expanded: boolean;
  onToggle: () => void;
  studied: boolean;
  practised: boolean;
  quizTaken: boolean;
  /** Coding/lab unit: no quiz step, readiness comes from study + practice. */
  isCodingWeek?: boolean;
  /** Published coding exercises for this unit (read-only student view). */
  exercises?: PublishedCodingExercise[];

  quizScore?: number;
  quizAvailable: boolean;
  quizLocked: boolean;
  quizFinalAttempt?: boolean;
  readiness: number;
  weakConcepts: string[];
  highlighted?: boolean;
  concepts?: UnitConceptMastery[];
  onStudyConcept?: (concept: string, isWeak: boolean) => void;
  resources: UnitResource[];
  activityDone: Record<string, boolean>;
  onToggleActivity: (id: string) => void;
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

const UnitPathwayCard = ({
  unitNumber,
  topic,
  totalUnits,
  expanded,
  onToggle,
  studied,
  practised,
  quizTaken,
  isCodingWeek = false,
  exercises = [],

  quizScore,
  quizAvailable,
  quizLocked,
  quizFinalAttempt,
  readiness,
  weakConcepts,
  highlighted = false,
  concepts = [],
  onStudyConcept,
  resources,
  activityDone,
  onToggleActivity,
  onStudy,
  onPractice,
  onTakeQuiz,
  onGoToNextUnit,
}: UnitPathwayCardProps) => {
  const [showResources, setShowResources] = useState(false);
  const [openExercises, setOpenExercises] = useState<string[]>([]);
  const toggleExercise = (id: string) =>
    setOpenExercises((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const stage = computeUnitStage({ studied, practised, quizTaken, readiness, quizExempt: isCodingWeek });
  const ready = stage === "ready";
  const weakList = weakConcepts.slice(0, 2).join(", ");
  const isLastUnit = unitNumber >= totalUnits;
  const readingCount = resources.length;
  const readingsDone = resources.filter((r) => activityDone[r.id]).length;
  const weakSet = new Set(weakConcepts);
  const chipConcepts = concepts.slice(0, 3);
  const extraConceptCount = Math.max(0, concepts.length - chipConcepts.length);



  return (
    <Card
      id={`unit-card-${unitNumber}`}
      className={`overflow-hidden transition-shadow ${expanded ? "border-primary/20" : ""} ${
        highlighted ? "ring-2 ring-primary" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unit {unitNumber}
            </p>
            {isCodingWeek && (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Code2 className="h-2.5 w-2.5" /> Coding/lab
              </Badge>
            )}
          </div>
          <h2 className="truncate font-heading text-base font-bold md:text-lg">{topic}</h2>
          {!expanded && concepts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {chipConcepts.map((c) => (
                <span
                  key={c.name}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {c.name}
                </span>
              ))}
              {extraConceptCount > 0 && (
                <span className="text-[11px] text-muted-foreground">+{extraConceptCount} more</span>
              )}
            </div>
          )}
        </div>
        {quizTaken && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              ready ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {readiness}% readiness{ready ? " · Ready" : ""}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <CardContent className="space-y-5 px-5 pb-5 pt-0 md:px-6">
          {/* Your next move */}
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your next move
            </p>
            {stage === "not_started" && (
              <>
                <p className="mt-1 font-heading text-base font-bold">Start studying</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isCodingWeek
                    ? "Work through this unit with your teaching assistant, practise a few questions, then complete the coding exercise below."
                    : "Work through this unit with your teaching assistant, practise a few questions, then take the weekly quiz."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={onStudy}>
                    Start studying
                  </Button>
                  {!isCodingWeek && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onTakeQuiz}
                      disabled={!quizAvailable || quizLocked}
                    >
                      Take quiz now
                    </Button>
                  )}
                </div>
              </>
            )}
            {stage === "studied" && (
              <>
                <p className="mt-1 font-heading text-base font-bold">Do practice questions</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You've studied this unit — now check what stuck with scored practice questions.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={onPractice}>
                    Start practice
                  </Button>
                  <Button size="sm" variant="outline" onClick={onStudy}>
                    Keep studying
                  </Button>
                </div>
              </>
            )}
            {stage === "practised" && (
              <>
                {isCodingWeek ? (
                  <>
                    <p className="mt-1 font-heading text-base font-bold">Keep practising</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This coding/lab unit has no quiz — scored practice raises your readiness until
                      you're ready to move on.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={onPractice}>
                        Start practice
                      </Button>
                      <Button size="sm" variant="outline" onClick={onStudy}>
                        Keep studying
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-heading text-base font-bold">Take the Unit {unitNumber} quiz</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You've studied and practised. One scored attempt sets your readiness for this unit.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={onTakeQuiz} disabled={!quizAvailable || quizLocked}>
                        Take quiz
                      </Button>
                      <Button size="sm" variant="outline" onClick={onPractice}>
                        More practice
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            {stage === "needs_work" && (
              <>
                <p className="mt-1 font-heading text-base font-bold">Study and practice</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your weekly quiz is done{typeof quizScore === "number" ? ` (${quizScore}%)` : ""}, but
                  readiness is below {READINESS_THRESHOLD}%. Scored practice keeps raising it
                  {weakList ? ` — start with ${weakList}.` : "."}
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
                  You're ready to proceed. Study and practice stay open if you want to push readiness
                  higher.
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

          {/* Concepts in this unit */}
          {concepts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Concepts in this unit
              </p>
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
                      className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-card"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${MASTERY_SWATCH_CLASS[level]}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      {level !== "expert" && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Focus
                        </Badge>
                      )}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {level === "not_explored" ? MASTERY_LABEL[level] : `${c.mastery}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                These are the same concepts shown in your concept mastery map.
              </p>
            </div>
          )}

          {/* 3-step path */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              This unit's path
            </p>
            <div className="flex flex-col gap-3 md:flex-row">
              <StepCard
                index={1}
                icon={BookOpen}
                title={quizTaken ? "Study weak concepts" : "Study"}
                description={`${studied ? "Completed. " : ""}${
                  quizTaken && weakList
                    ? `Go deeper on ${weakList} with your teaching assistant.`
                    : "Learn this unit's concepts with your teaching assistant."
                }${readingCount > 0 ? ` ${readingCount} reading${readingCount === 1 ? "" : "s"} below.` : ""}`}
                action={studied ? "Keep studying" : "Start studying"}
                onAction={onStudy}
                done={studied}
              />
              <StepCard
                index={2}
                icon={PenLine}
                title="Practice"
                description={`${practised ? "Completed. " : ""}Answer AI-generated practice questions. These count towards your readiness.`}
                action={practised ? "More practice" : "Start practice"}
                onAction={onPractice}
                done={practised}
              />
              {!isCodingWeek && (
                <StepCard
                  index={3}
                  icon={ClipboardCheck}
                  title="Weekly Quiz"
                  description={
                    quizTaken
                      ? `Completed${typeof quizScore === "number" ? ` — ${quizScore}%` : ""}. One attempt only.`
                      : quizLocked
                        ? "Locked — attempts voided for leaving the quiz. Contact your professor."
                        : quizAvailable
                          ? "One scored attempt that sets your starting readiness for this unit."
                          : "Not published for this unit yet."
                  }
                  action={
                    quizTaken
                      ? "Quiz completed"
                      : quizLocked
                        ? "Locked"
                        : quizFinalAttempt
                          ? "Retake quiz (final attempt)"
                          : "Take quiz"
                  }
                  onAction={onTakeQuiz}
                  done={quizTaken}
                  disabled={quizTaken || quizLocked || !quizAvailable}
                />
              )}
            </div>
          </div>

          {/* Readings & exercises */}
          {readingCount > 0 && (
            <div className="rounded-xl border">
              <button
                type="button"
                onClick={() => setShowResources((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <span className="text-sm font-semibold">
                  Readings &amp; exercises
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {readingsDone} / {readingCount} done
                  </span>
                </span>
                {showResources ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showResources && (
                <div className="space-y-1.5 px-4 pb-4">
                  {resources.map((r) => {
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
                              done
                                ? "text-muted-foreground line-through"
                                : hasUrl
                                  ? "text-primary group-hover:underline"
                                  : ""
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
                        {r.type === "coding-exercise" && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Optional
                          </Badge>
                        )}
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
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default UnitPathwayCard;
