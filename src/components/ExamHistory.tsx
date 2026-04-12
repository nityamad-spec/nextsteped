import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { History, Trophy, Clock, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Loader2, CheckCircle, XCircle, Lightbulb, BarChart3, BookOpen, Brain, ArrowRight } from "lucide-react";
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
  const navigate = useNavigate();
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

  // Compute weak topics from all attempts
  const weakTopics = (() => {
    const topicStats: Record<string, { correct: number; total: number }> = {};
    for (const attempt of attempts) {
      if (!attempt.answers) continue;
      for (const a of attempt.answers as any[]) {
        const topic = a.topic || "General";
        if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
        topicStats[topic].total++;
        if (a.is_correct) topicStats[topic].correct++;
      }
    }
    return Object.entries(topicStats)
      .map(([topic, stats]) => ({
        topic,
        accuracy: Math.round((stats.correct / stats.total) * 100),
        total: stats.total,
      }))
      .filter(t => t.accuracy < 70)
      .sort((a, b) => a.accuracy - b.accuracy);
  })();

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
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
      <div className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading performance data…</span>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No practice exams yet</p>
        <p className="text-xs text-muted-foreground mt-1">Complete your first exam to see your performance dashboard</p>
      </div>
    );
  }

  const avgScore = Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length);
  const bestScore = Math.max(...attempts.map(a => a.score));
  const latestScore = attempts[0].score;

  return (
    <div className="space-y-4">

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-lg font-bold">{attempts.length}</p>
          <p className="text-[10px] text-muted-foreground">Attempts</p>
        </div>
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-lg font-bold text-primary">{bestScore}%</p>
          <p className="text-[10px] text-muted-foreground">Best</p>
        </div>
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-lg font-bold">{avgScore}%</p>
          <p className="text-[10px] text-muted-foreground">Average</p>
        </div>
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-lg font-bold">{latestScore}%</p>
          <p className="text-[10px] text-muted-foreground">Latest</p>
        </div>
      </div>

      {/* Weak Topics - Suggested for Review */}
      {weakTopics.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold">Topics to Focus On</p>
          </div>
          <div className="space-y-1.5">
            {weakTopics.slice(0, 4).map(t => (
              <div key={t.topic} className="flex items-center justify-between text-xs">
                <span className="font-medium">{t.topic}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${t.accuracy < 40 ? "text-destructive" : "text-muted-foreground"}`}>{t.accuracy}%</span>
                  <span className="text-muted-foreground">({t.total} Qs)</span>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1 h-8 text-xs gap-1.5"
            onClick={() => {
              const topics = weakTopics.slice(0, 3).map(t => t.topic).join(", ");
              navigate(`/student/chat?newchat=true&topics=${encodeURIComponent(topics)}`);
            }}
          >
            <BookOpen className="h-3 w-3" />
            Practice These in Study Mode
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Attempt list */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">All Attempts</p>
        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-2">
            {attempts.map((attempt, i) => {
              const isExpanded = expandedAttempt === attempt.id;
              const trend = getTrend(i);
              const passed = attempt.score >= 60;
              const attemptExplanations = explanations[attempt.id];

              return (
                <Card key={attempt.id} className={`${passed ? "border-primary/20" : "border-destructive/20"}`}>
                  <CardContent className="p-0">
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

                    {isExpanded && (
                      <div className="border-t px-3 pb-3 pt-2 space-y-3">
                        <div className="flex items-center gap-2">
                          <Progress value={attempt.score} className="h-2 flex-1" />
                          <span className="text-xs font-medium">{attempt.score}%</span>
                        </div>

                        {attempt.answers && attempt.answers.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Question Review</p>
                            {(attempt.answers as any[]).map((a: any, qi: number) => (
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
      </div>
    </div>
  );
};

export default ExamHistory;