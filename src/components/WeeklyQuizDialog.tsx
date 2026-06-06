import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seededShuffle } from "@/lib/seededShuffle";
import { getQuizQuestions, Question } from "@/data/questionBank";
import AssessmentView, { AssessmentResults, ConfidenceLevel } from "@/components/AssessmentView";
import {
  WQ_STANDARD_COUNT,
  WQ_ADAPTIVE_COUNT,
  pickWeeklyBranchTier,
  computeWeeklyLearnerLevel,
  type WqBranchTier,
} from "@/lib/weeklyQuizBranching";
import type { Json } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string | null;
  studentId: string | null;
  day: number | null;
  /** Ignored — adaptive flow always uses 5 + 5 = 10 questions. */
  numQuestions?: number;
  timeLimitMinutes?: number;
}

type Buckets = Record<"standard" | WqBranchTier, Question[]>;

function mapRowToQuestion(row: any): Question {
  return {
    id: row.id,
    text: row.question_text,
    type: (row.question_type === "MCQ"
      ? "mcq"
      : row.question_type === "Problem Solving"
      ? "problem_solving"
      : row.question_type === "True/False"
      ? "true_false"
      : "short_answer") as Question["type"],
    options: row.options as string[] | undefined,
    correctAnswer: row.answer,
    topic: row.topic,
    difficulty: row.difficulty as "Easy" | "Medium" | "Hard",
    day: row.quiz_day || 0,
  };
}

async function invokeUpdateMastery(args: {
  courseId: string;
  source: "weekly_quiz";
  sourceId: string | null;
  answers: any[];
}) {
  try {
    const tally = new Map<string, { attempted: number; correct: number }>();
    for (const a of args.answers ?? []) {
      const code = (a?.topic ?? "").toString().trim();
      if (!code) continue;
      const t = tally.get(code) ?? { attempted: 0, correct: 0 };
      t.attempted += 1;
      if (a?.is_correct) t.correct += 1;
      tally.set(code, t);
    }
    if (tally.size === 0) return;
    await supabase.functions.invoke("update-mastery", {
      body: {
        course_id: args.courseId,
        source: args.source,
        source_id: args.sourceId,
        per_concept: Array.from(tally.entries()).map(([concept_code, t]) => ({
          concept_code,
          attempted: t.attempted,
          correct: t.correct,
        })),
      },
    });
  } catch (e) {
    console.error("update-mastery invoke failed", e);
  }
}

type Phase = "loading" | "phaseA" | "branching" | "phaseB" | "submitted";

const WeeklyQuizDialog = ({
  open,
  onOpenChange,
  courseId,
  studentId,
  day,
  timeLimitMinutes = 10,
}: Props) => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  /** Fallback (no tiered questions in DB) — use static bank, single pass. */
  const [fallbackQuestions, setFallbackQuestions] = useState<Question[] | null>(null);
  const [phaseAQuestions, setPhaseAQuestions] = useState<Question[]>([]);
  const [phaseAResult, setPhaseAResult] = useState<AssessmentResults | null>(null);
  const [phaseBQuestions, setPhaseBQuestions] = useState<Question[]>([]);
  const [chosenTier, setChosenTier] = useState<WqBranchTier | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset + fetch on open
  useEffect(() => {
    if (!open || !courseId || !day) return;
    let cancelled = false;
    setPhase("loading");
    setBuckets(null);
    setFallbackQuestions(null);
    setPhaseAQuestions([]);
    setPhaseAResult(null);
    setPhaseBQuestions([]);
    setChosenTier(null);
    setError(null);

    (async () => {
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("*")
        .eq("course_id", courseId)
        .eq("mode", "daily_quiz")
        .eq("quiz_day", day);

      if (cancelled) return;

      if (error || !data || data.length === 0) {
        // Fallback to the static local bank — no adaptive routing possible.
        const qs = getQuizQuestions(day, WQ_STANDARD_COUNT + WQ_ADAPTIVE_COUNT);
        setFallbackQuestions(qs);
        setPhaseAQuestions(qs);
        setPhase("phaseA");
        return;
      }

      // Bucket by tier; fall back to "standard" for missing tier values.
      const seed = (studentId || "anon") + courseId + ":" + day;
      const b: Buckets = { standard: [], easy: [], medium: [], hard: [] };
      for (const row of data as any[]) {
        const tier: keyof Buckets = (row.tier === "easy" || row.tier === "medium" || row.tier === "hard")
          ? row.tier
          : "standard";
        b[tier].push(mapRowToQuestion(row));
      }
      // Seeded shuffle each bucket so order is stable per student.
      (Object.keys(b) as (keyof Buckets)[]).forEach((k) => {
        b[k] = seededShuffle(b[k], seed + ":" + k);
      });

      if (b.standard.length === 0) {
        setError("This quiz isn't ready yet — your professor hasn't generated questions for this week.");
        setPhase("phaseA"); // will show empty state via questions.length === 0 path
        return;
      }

      // If there's no adaptive bank (easy/medium/hard all empty), treat as
      // single-pass fallback — Phase A submission becomes the final submission.
      const adaptiveTotal = b.easy.length + b.medium.length + b.hard.length;
      if (adaptiveTotal === 0) {
        const pool = b.standard.slice(0, WQ_STANDARD_COUNT + WQ_ADAPTIVE_COUNT);
        setFallbackQuestions(pool);
        setPhaseAQuestions(pool);
        setPhase("phaseA");
        return;
      }

      setBuckets(b);
      setPhaseAQuestions(b.standard.slice(0, WQ_STANDARD_COUNT));
      setPhase("phaseA");
    })();

    return () => { cancelled = true; };
  }, [open, courseId, day, studentId]);

  // Build Phase B once branching is chosen.
  useEffect(() => {
    if (phase !== "branching" || !buckets || !chosenTier || !phaseAResult) return;
    // Pick Phase B questions from chosen tier; if too few, fall back medium → easy → hard.
    const order: WqBranchTier[] = [chosenTier, "medium", "easy", "hard"];
    let chosen: Question[] = [];
    for (const t of order) {
      const pool = buckets[t] || [];
      if (pool.length >= WQ_ADAPTIVE_COUNT) {
        chosen = pool.slice(0, WQ_ADAPTIVE_COUNT);
        break;
      }
      if (chosen.length === 0 && pool.length > 0) chosen = pool.slice(0, WQ_ADAPTIVE_COUNT);
    }
    setPhaseBQuestions(chosen);
    setPhase("phaseB");
  }, [phase, buckets, chosenTier, phaseAResult]);

  // Phase A submit — DON'T persist; compute branch and advance to Phase B.
  const handlePhaseASubmit = (results: AssessmentResults) => {
    setPhaseAResult(results);
    // Fallback mode (no tiered bank) — treat Phase A submission as the final
    // submission and persist a single 5-question result.
    if (fallbackQuestions) {
      void persistFinalResult(results, null);
      setPhase("submitted");
      return;
    }
    const tier = pickWeeklyBranchTier(results.correctAnswers);
    setChosenTier(tier);
    setPhase("branching");
  };

  // Phase B submit — combine and persist.
  const handlePhaseBSubmit = (combined: AssessmentResults) => {
    // `combined` already contains all answered questions (we passed all 10 to
    // Phase B with Phase A's answers pre-filled), so scoring is over the full set.
    void persistFinalResult(combined, chosenTier);
    setPhase("submitted");
  };

  const persistFinalResult = async (results: AssessmentResults, branchTier: WqBranchTier | null) => {
    if (!studentId || !courseId || !day) return;
    try {
      const masteryScore = results.totalQuestions > 0
        ? results.correctAnswers / results.totalQuestions
        : 0;
      const learnerLevel = computeWeeklyLearnerLevel(results.correctAnswers, results.totalQuestions);
      const { data: inserted, error } = await supabase
        .from("assessment_results")
        .insert({
          student_id: studentId,
          course_id: courseId,
          mode: "daily_quiz",
          quiz_day: day,
          score: results.score,
          total_questions: results.totalQuestions,
          correct_answers: results.correctAnswers,
          answers: (results.answers ?? []) as unknown as Json,
          time_spent: results.timeSpent ?? 0,
          confidences: (results.confidences ?? {}) as unknown as Json,
          question_times: (results.questionTimes ?? {}) as unknown as Json,
          branch_tier: branchTier,
          mastery_score: masteryScore,
          learner_level: learnerLevel,
        })
        .select("id")
        .single();
      if (error) {
        console.error("Failed to save quiz results:", error);
        return;
      }
      void invokeUpdateMastery({
        courseId,
        source: "weekly_quiz",
        sourceId: inserted?.id ?? null,
        answers: results.answers ?? [],
      });
    } catch (e) {
      console.error("Quiz submit error:", e);
    }
  };

  const handleEnd = () => onOpenChange(false);

  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    // Trying to close mid-quiz
    if (phase === "phaseA" || phase === "phaseB" || phase === "branching") {
      const hasStarted = phaseAQuestions.length > 0;
      if (hasStarted) {
        setConfirmLeave(true);
        return;
      }
    }
    onOpenChange(false);
  };

  // Build the combined 10-question array for Phase B mount, with Phase A answers
  // carried over so the final review renders all 10.
  const phaseBMount = useMemo(() => {
    if (phase !== "phaseB" || !phaseAResult) return null;
    const all = [...phaseAQuestions, ...phaseBQuestions];
    const initialAnswers: Record<string, string> = {};
    const initialConfidences: Record<string, ConfidenceLevel> = { ...(phaseAResult.confidences || {}) };
    const initialQuestionTimes: Record<string, number> = { ...(phaseAResult.questionTimes || {}) };
    for (const a of phaseAResult.answers || []) {
      if (a.selected) initialAnswers[a.question_id] = a.selected;
    }
    return { all, initialAnswers, initialConfidences, initialQuestionTimes };
  }, [phase, phaseAResult, phaseAQuestions, phaseBQuestions]);

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          className="max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col"
          onInteractOutside={(e) => {
            if (phase === "phaseA" || phase === "phaseB" || phase === "branching") e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (phase === "phaseA" || phase === "phaseB" || phase === "branching") e.preventDefault();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Weekly Quiz{day ? ` — Week ${day}` : ""}</DialogTitle>
            <DialogDescription>
              Adaptive weekly quiz: 5 standard questions, then 5 more tailored to your performance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {phase === "loading" ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {error}
              </div>
            ) : phase === "phaseA" ? (
              phaseAQuestions.length === 0 ? (
                <div className="h-full flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  No quiz questions are available for this week yet.
                </div>
              ) : (
                <AssessmentView
                  type="quiz"
                  questions={phaseAQuestions}
                  timeLimitMinutes={timeLimitMinutes}
                  day={day ?? 1}
                  onEnd={handleEnd}
                  onSubmit={handlePhaseASubmit}
                  introTitle={fallbackQuestions ? `Weekly Quiz — Week ${day ?? 1}` : `Weekly Quiz — Week ${day ?? 1} (Part 1 of 2)`}
                />
              )
            ) : phase === "branching" ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">Tailoring your next 5 questions…</p>
                <p className="text-xs text-muted-foreground">Based on Part 1 we're picking the right difficulty for you.</p>
              </div>
            ) : phase === "phaseB" && phaseBMount ? (
              <AssessmentView
                key="phase-b"
                type="quiz"
                questions={phaseBMount.all}
                timeLimitMinutes={timeLimitMinutes}
                day={day ?? 1}
                onEnd={handleEnd}
                onSubmit={handlePhaseBSubmit}
                initialPhase="active"
                initialIndex={WQ_STANDARD_COUNT}
                initialAnswers={phaseBMount.initialAnswers}
                initialConfidences={phaseBMount.initialConfidences}
                initialQuestionTimes={phaseBMount.initialQuestionTimes}
              />
            ) : null}
          </div>
          {(phase === "loading" || (phase === "phaseA" && phaseAQuestions.length === 0) || error) && (
            <DialogFooter className="p-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Leave quiz?
            </DialogTitle>
            <DialogDescription>
              Your progress will be discarded and not submitted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>Stay</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmLeave(false);
                onOpenChange(false);
              }}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WeeklyQuizDialog;
