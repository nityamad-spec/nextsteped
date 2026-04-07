import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Trophy, Clock, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Loader2, CheckCircle, XCircle, Lightbulb } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ExamAttempt {
  id: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_spent: number;
  created_at: string;
  mode: string;
  answers: any[];
}

interface ExamHistoryProps {
  courseId: string | null;
}

const ExamHistory = ({ courseId }: ExamHistoryProps) => {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, Record<number, string>>>({});
  const [loadingExplanations, setLoadingExplanations] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchHistory = async () => {
      setLoading(true);
      let query = supabase
        .from("assessment_results")
        .select("*")
        .eq("student_id", user.id)
        .eq("mode", "exam")
        .order("created_at", { ascending: false })
        .limit(50);
      if (courseId) query = query.eq("course_id", courseId);
      const { data } = await query;
      setAttempts((data || []) as ExamAttempt[]);
      setLoading(false);
    };
    fetchHistory();
  }, [user, courseId]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const toggleAttempt = (id: string) => {
    setExpandedAttempt(prev => prev === id ? null : id);
  };

  const fetchExplanationsForAttempt = async (attempt: ExamAttempt) => {
    if (explanations[attempt.id]) return;
    setLoadingExplanations(attempt.id);
    try {
      const answersData = (attempt.answers || []).map((a: any) => ({
        question_id: a.question_id || "",
        question_text: a.question_text || "",
        type: a.type || "mcq",
        topic: a.topic || "",
        selected: a.selected || "",
        correct: a.correct || "",
        is_correct: a.is_correct || false,
      }));
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-answers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ answers: answersData }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.explanations)) {
          const map: Record<number, string> = {};
          data.explanations.forEach((e: { index: number; explanation: string }) => {
            map[e.index] = e.explanation;
          });
          setExplanations(prev => ({ ...prev, [attempt.id]: map }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch explanations:", e);
    } finally {
      setLoadingExplanations(null);
    }
  };

  const getTrend = (index: number): "up" | "down" | "same" | null => {
    if (index >= attempts.length - 1) return null;
    const current = attempts[index].score;
    const prev = attempts[index + 1].score;
    if (current > prev) return "up";
    if (current < prev) return "down";
    return "same";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading exam history…</span>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="text-center py-6">
        <History className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No exam attempts yet. Start your first practice exam above!</p>
      </div>
    );
  }

  // Stats summary
  const avgScore = Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length);
  const bestScore = Math.max(...attempts.map(a => a.score));
  const latestScore = attempts[0].score;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-lg font-bold">{attempts.length}</p>
          <p className="text-[10px] text-muted-foreground">Attempts</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-lg font-bold text-primary">{bestScore}%</p>
          <p className="text-[10px] text-muted-foreground">Best</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-lg font-bold">{avgScore}%</p>
          <p className="text-[10px] text-muted-foreground">Average</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-lg font-bold">{latestScore}%</p>
          <p className="text-[10px] text-muted-foreground">Latest</p>
        </div>
      </div>

      {/* Attempt list */}
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {attempts.map((attempt, i) => {
            const isExpanded = expandedAttempt === attempt.id;
            const trend = getTrend(i);
            const passed = attempt.score >= 60;
            const attemptExplanations = explanations[attempt.id];

            return (
              <Card key={attempt.id} className={`${passed ? "border-primary/20" : "border-destructive/20"}`}>
                <CardContent className="p-0">
                  {/* Collapsed row */}
                  <button
                    onClick={() => {
                      toggleAttempt(attempt.id);
                      if (!isExpanded && !explanations[attempt.id] && attempt.answers?.length > 0) {
                        fetchExplanationsForAttempt(attempt);
                      }
                    }}
                    className="w-full text-left p-3 hover:bg-muted/30 transition-colors rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                          passed ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                        }`}>
                          {attempt.score}%
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {attempt.correct_answers}/{attempt.total_questions} correct
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateTime(attempt.created_at)} · {formatTime(attempt.time_spent)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {trend === "up" && <TrendingUp className="h-4 w-4 text-primary" />}
                        {trend === "down" && <TrendingDown className="h-4 w-4 text-destructive" />}
                        {trend === "same" && <Minus className="h-4 w-4 text-muted-foreground" />}
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t px-3 pb-3 pt-2 space-y-3">
                      <div className="flex items-center gap-2">
                        <Progress value={attempt.score} className="h-2 flex-1" />
                        <span className="text-xs font-medium">{attempt.score}%</span>
                      </div>

                      {/* Question-level review */}
                      {attempt.answers && attempt.answers.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">Question Review</p>
                          {attempt.answers.map((a: any, qi: number) => (
                            <div
                              key={qi}
                              className={`rounded-lg border p-2.5 text-xs space-y-1 ${
                                a.is_correct ? "border-primary/20" : "border-destructive/20"
                              }`}
                            >
                              <div className="flex items-start gap-1.5">
                                {a.is_correct
                                  ? <CheckCircle className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                  : <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                                }
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium whitespace-pre-wrap">Q{qi + 1}: {a.question_text}</p>
                                  <p className="mt-0.5">
                                    <span className="text-muted-foreground">Your answer: </span>
                                    <span className={a.is_correct ? "text-primary" : "text-destructive"}>
                                      {a.selected || "Not answered"}
                                    </span>
                                  </p>
                                  {!a.is_correct && (
                                    <p>
                                      <span className="text-muted-foreground">Correct: </span>
                                      <span className="text-primary">{a.correct}</span>
                                    </p>
                                  )}
                                  {/* Explanation */}
                                  {attemptExplanations && attemptExplanations[qi] && (
                                    <div className="mt-1.5 rounded border bg-muted/30 p-2">
                                      <div className="flex items-center gap-1 mb-1">
                                        <Lightbulb className="h-3 w-3 text-primary" />
                                        <span className="font-semibold text-primary text-[10px]">Explanation</span>
                                      </div>
                                      <div className="prose prose-xs max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{attemptExplanations[qi]}</ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {a.topic && (
                                  <Badge variant="outline" className="text-[9px] shrink-0">{a.topic}</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                          {loadingExplanations === attempt.id && (
                            <div className="flex items-center gap-2 py-1">
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              <span className="text-xs text-muted-foreground">Loading explanations…</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Detailed answers not available for this attempt.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExamHistory;
