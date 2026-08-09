import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string | null;
  weekNumber: number | null;
  weekName?: string;
}

interface QRow {
  id: string;
  tier: string | null;
  question_text: string;
  format: string | null;
  question_type: string | null;
  options: any;
  answer: string | null;
  correct_index: number | null;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
  bloom_level: number | null;
  item_code: string | null;
  model_answer?: string | null;
  answer_max_words?: number | null;
}


const TIER_ORDER = ["standard", "easy", "medium", "hard"] as const;
const TIER_LABELS: Record<string, { title: string; sub: string }> = {
  standard: { title: "Standard — shown to every student", sub: "All 5 questions are given to every student first." },
  easy: { title: "Easy adaptive", sub: "Routed to students who struggle on the standard 5." },
  medium: { title: "Medium adaptive", sub: "Routed to students with average performance on the standard 5." },
  hard: { title: "Hard adaptive", sub: "Routed to students who excel on the standard 5." },
};

export function WeeklyQuizReviewDialog({ open, onOpenChange, courseId, weekNumber, weekName }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<QRow[]>([]);

  const load = async () => {
    if (!courseId || !weekNumber) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("assessment_questions")
        .select("id, tier, question_text, format, question_type, options, answer, correct_index, explanation, topic, difficulty, bloom_level, item_code, model_answer, answer_max_words")
        .eq("course_id", courseId)
        .eq("mode", "daily_quiz")
        .eq("quiz_day", weekNumber)
        .order("tier", { ascending: true })
        .order("item_code", { ascending: true });
      if (qErr) throw qErr;
      setRows((data ?? []) as QRow[]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, courseId, weekNumber]);

  const grouped: Record<string, QRow[]> = {};
  for (const r of rows) {
    const t = (r.tier ?? "standard").toLowerCase();
    (grouped[t] ||= []).push(r);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Week {weekNumber} Quiz Review{weekName ? ` — ${weekName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Each student sees 10 questions: the 5 standard items, then 5 adaptive items routed by their performance on the standard set.
          </DialogDescription>
        </DialogHeader>


        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading questions…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No questions generated yet. Close this dialog and click <span className="font-medium">Generate Weekly Quiz</span> first.
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh] pr-3 -mr-3">
            <div className="space-y-6 pb-2">
              {TIER_ORDER.map((tier) => {
                const items = grouped[tier] ?? [];
                if (items.length === 0) return null;
                const label = TIER_LABELS[tier];
                return (
                  <section key={tier} className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">{label.title}</h3>
                      <p className="text-xs text-muted-foreground">{label.sub} · {items.length} question{items.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="space-y-3">
                      {items.map((q, idx) => {
                        const opts: string[] = Array.isArray(q.options) ? q.options.map((o: any) => String(o ?? "")) : [];
                        const correct = q.answer ?? (q.correct_index != null ? opts[q.correct_index] : null);
                        const isShort = (q.format ?? "").toLowerCase() === "short_answer";
                        const fmtLabel = isShort
                          ? "Short Answer"
                          : q.format === "true_false"
                          ? "True / False"
                          : "MCQ";
                        return (
                          <div key={q.id} className="rounded-lg border bg-card p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px]">Q{idx + 1}</Badge>
                              <Badge variant="outline" className="text-[10px]">{fmtLabel}</Badge>
                              {q.topic && <Badge variant="outline" className="text-[10px]">{q.topic}</Badge>}
                              {q.difficulty && <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>}
                              {q.bloom_level != null && (
                                <Badge variant="outline" className="text-[10px]">Bloom L{q.bloom_level}</Badge>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{q.question_text}</p>
                            {isShort ? (
                              <div className="space-y-1.5">
                                {q.answer && (
                                  <div className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs">
                                    <span className="font-medium">Reference answer: </span>
                                    <span className="whitespace-pre-wrap">{q.answer}</span>
                                  </div>
                                )}
                                {q.model_answer && (
                                  <div className="rounded-md border bg-background px-2 py-1.5 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Model answer: </span>
                                    <span className="whitespace-pre-wrap">{q.model_answer}</span>
                                  </div>
                                )}
                                {q.answer_max_words != null && (
                                  <p className="text-[11px] text-muted-foreground">
                                    Suggested length: up to {q.answer_max_words} words
                                  </p>
                                )}
                              </div>
                            ) : (
                              <ul className="space-y-1">
                                {opts.map((opt, i) => {
                                  const isCorrect = opt === correct;
                                  return (
                                    <li
                                      key={i}
                                      className={
                                        "flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs " +
                                        (isCorrect
                                          ? "border-primary/40 bg-primary/5 text-foreground"
                                          : "border-border bg-background text-muted-foreground")
                                      }
                                    >
                                      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold">
                                        {isCorrect ? <Check className="h-3 w-3 text-primary" /> : String.fromCharCode(65 + i)}
                                      </span>
                                      <span className="whitespace-pre-wrap">{opt}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}

                            {q.explanation && (
                              <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Explanation: </span>
                                <span className="whitespace-pre-wrap">{q.explanation}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WeeklyQuizReviewDialog;
