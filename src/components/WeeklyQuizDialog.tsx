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
  const [submitted, setSubmitted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Reset + fetch on open
  useEffect(() => {
    if (!open || !courseId || !day) return;
    let cancelled = false;
    setLoading(true);
    setSubmitted(false);
    setQuestions([]);

    (async () => {
      let qs: Question[] = [];
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("*")
        .eq("course_id", courseId)
        .eq("mode", "daily_quiz")
        .eq("quiz_day", day);

      if (!error && data && data.length > 0) {
        qs = data.map((row: any) => ({
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
        }));
        const seed = (studentId || "anon") + courseId;
        qs = seededShuffle(qs, seed).slice(0, Math.min(numQuestions, qs.length));
      } else {
        qs = [];
      }
      if (cancelled) return;
      setQuestions(qs);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, courseId, day, studentId, numQuestions]);

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
          confidences: (results.confidences ?? {}) as unknown as Json,
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
