import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seededShuffle } from "@/lib/seededShuffle";
import type { Question } from "@/data/questionBank";
import AssessmentView, { AssessmentResults } from "@/components/AssessmentView";
import type { Json } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string | null;
  studentId: string | null;
  day: number | null;
  numQuestions?: number;
  timeLimitMinutes?: number;
}

async function invokeUpdateMastery(args: {
  courseId: string;
  source: "weekly_quiz";
  sourceId: string | null;
  answers: any[];
  questionMeta: Map<string, { difficulty: number; bloom: number }>;
}) {
  try {
    const per_question: Array<{
      concept_code: string;
      difficulty: number;
      bloom: number;
      is_correct: boolean;
      reasoning_correct?: boolean | null;
    }> = [];
    for (const a of args.answers ?? []) {
      const code = (a?.topic ?? "").toString().trim();
      const meta = a?.question_id ? args.questionMeta.get(a.question_id) : undefined;
      if (!code || !meta) continue;
      const rc = a?.reasoning_is_correct;
      per_question.push({
        concept_code: code,
        difficulty: meta.difficulty,
        bloom: meta.bloom,
        is_correct: !!a.is_correct,
        reasoning_correct: rc === true || rc === false ? rc : null,
      });
    }
    if (per_question.length === 0) return;
    await supabase.functions.invoke("update-mastery", {
      body: {
        course_id: args.courseId,
        source: args.source,
        source_id: args.sourceId,
        per_question,
      },
    });
  } catch (e) {
    console.error("update-mastery invoke failed", e);
  }
}

const WeeklyQuizDialog = ({
  open,
  onOpenChange,
  courseId,
  studentId,
  day,
  numQuestions = 5,
  timeLimitMinutes = 10,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionMeta, setQuestionMeta] = useState<Map<string, { difficulty: number; bloom: number }>>(new Map());
  const [followupsByParentId, setFollowupsByParentId] = useState<Map<string, Question>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Reset + fetch on open
  useEffect(() => {
    if (!open || !courseId || !day) return;
    let cancelled = false;
    setLoading(true);
    setSubmitted(false);
    setQuestions([]);
    setQuestionMeta(new Map());
    setFollowupsByParentId(new Map());

    (async () => {
      let qs: Question[] = [];
      const meta = new Map<string, { difficulty: number; bloom: number }>();
      const followupMap = new Map<string, Question>();
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("*")
        .eq("course_id", courseId)
        .eq("mode", "daily_quiz")
        .eq("quiz_day", day);

      if (!error && data && data.length > 0) {
        const mapRow = (row: any): Question & { _tier: string; _parentId: string | null; _role: string } => {
          meta.set(row.id, {
            difficulty: Number(row.difficulty_estimate ?? 0.5),
            bloom: Number(row.bloom_level ?? 1),
          });
          return {
            id: row.id,
            text: row.question_text,
            type: (row.question_type === "MCQ"
              ? "mcq"
              : row.question_type === "Problem Solving"
              ? "problem_solving"
              : row.question_type === "True/False" || row.question_type === "TF"
              ? "true_false"
              : "short_answer") as Question["type"],
            options: row.options as string[] | undefined,
            correctAnswer: row.answer,
            topic: row.topic,
            difficulty: row.difficulty as "Easy" | "Medium" | "Hard",
            day: row.quiz_day || 0,
            explanation: (row.explanation ?? undefined) as string | undefined,
            _tier: String(row.tier ?? "standard"),
            _parentId: (row.parent_question_id ?? null) as string | null,
            _role: String(row.question_role ?? "primary"),
          } as Question & { _tier: string; _parentId: string | null; _role: string };
        };
        const allRows = data.map(mapRow);

        // Split rows by role. Legacy rows (null role) are treated as primary.
        const primariesAll = allRows.filter(r => r._role !== "reasoning");
        const reasonings = allRows.filter(r => r._role === "reasoning" && r._parentId);
        for (const r of reasonings) {
          const { _tier, _parentId, _role, ...rest } = r;
          if (_parentId) followupMap.set(_parentId, rest as Question);
        }

        // Determine adaptive tier from learner_level
        let adaptiveTier: "easy" | "medium" | "hard" = "medium";
        if (studentId) {
          const { data: cm } = await supabase
            .from("student_course_mastery")
            .select("learner_level")
            .eq("student_id", studentId)
            .eq("course_id", courseId)
            .maybeSingle();
          const lvl = (cm?.learner_level ?? "").toString().toLowerCase();
          if (lvl === "beginner") adaptiveTier = "easy";
          else if (lvl === "expert") adaptiveTier = "hard";
          else adaptiveTier = "medium"; // developing, proficient, or unknown
        }

        const seed = (studentId || "anon") + courseId;
        const byTier: Record<string, (Question & { _tier: string; _parentId: string | null; _role: string })[]> = {};
        for (const q of primariesAll) {
          (byTier[q._tier] ||= []).push(q);
        }
        for (const k of Object.keys(byTier)) {
          byTier[k] = seededShuffle(byTier[k], seed + ":" + k);
        }

        const standard = (byTier["standard"] ?? []).slice(0, 5);
        const adaptiveOrder: Array<"easy" | "medium" | "hard"> =
          adaptiveTier === "medium"
            ? ["medium", "easy", "hard"]
            : adaptiveTier === "easy"
            ? ["easy", "medium", "hard"]
            : ["hard", "medium", "easy"];
        const adaptive: (Question & { _tier: string; _parentId: string | null; _role: string })[] = [];
        for (const t of adaptiveOrder) {
          if (adaptive.length >= 5) break;
          const pool = byTier[t] ?? [];
          for (const q of pool) {
            if (adaptive.length >= 5) break;
            adaptive.push(q);
          }
        }

        const combined = [...standard, ...adaptive];
        qs = combined.map(({ _tier, _parentId, _role, ...rest }) => rest as Question);

        // Tidy: keep only follow-ups whose parent is actually being delivered.
        const deliveredIds = new Set(qs.map(q => q.id));
        for (const parentId of Array.from(followupMap.keys())) {
          if (!deliveredIds.has(parentId)) followupMap.delete(parentId);
        }
      } else {
        qs = [];
      }
      if (cancelled) return;
      setQuestions(qs);
      setQuestionMeta(meta);
      setFollowupsByParentId(followupMap);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, courseId, day, studentId]);


  const handleSubmit = async (results: AssessmentResults) => {
    setSubmitted(true);
    if (!studentId || !courseId || !day) return;
    try {
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
          confidences: {} as unknown as Json,
          question_times: (results.questionTimes ?? {}) as unknown as Json,
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
        questionMeta,
      });
    } catch (e) {
      console.error("Quiz submit error:", e);
    }
  };

  const handleEnd = () => {
    // AssessmentView calls onEnd from intro (cancel) or review (close) phases
    onOpenChange(false);
  };

  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    // Trying to close
    if (!submitted && questions.length > 0 && !loading) {
      setConfirmLeave(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          className="max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col"
          onInteractOutside={(e) => {
            if (!submitted && questions.length > 0) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!submitted && questions.length > 0) e.preventDefault();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Weekly Quiz{day ? ` — Week ${day}` : ""}</DialogTitle>
            <DialogDescription>
              Optional weekly quiz to check your understanding of recent concepts.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : questions.length === 0 ? (
              <div className="h-full flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                No quiz questions are available for this week yet.
              </div>
            ) : (
              <AssessmentView
                type="quiz"
                questions={questions}
                timeLimitMinutes={timeLimitMinutes}
                day={day ?? 1}
                onEnd={handleEnd}
                onSubmit={handleSubmit}
                questionMeta={questionMeta}
                followupsByParentId={followupsByParentId}
              />

            )}
          </div>
          {(loading || questions.length === 0) && (
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
