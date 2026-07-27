import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { useAuth } from "@/contexts/AuthContext";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useLearningPlan, type LearningPlanWeek } from "@/hooks/useLearningPlan";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ClipboardCheck, ChevronDown, ChevronUp, Lock, Check } from "lucide-react";
import WeeklyQuizDialog from "@/components/WeeklyQuizDialog";
import DiagnosticGateDialog from "@/components/student/DiagnosticGateDialog";

const accuracyPct = (correct: number, total: number) =>
  total > 0 ? Math.round((correct / total) * 100) : 0;

const formatAvgTime = (seconds: number, totalQuestions: number) => {
  if (totalQuestions <= 0 || seconds <= 0) return "—";
  return `${Math.round(seconds / totalQuestions)}s/question`;
};

const parseList = (text: string) =>
  text.split("\n").map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);

interface QuizResultRow {
  quiz_day: number | string;
  score: number | string;
  correct_answers: number | string;
  total_questions: number | string;
  time_spent: number | string;
}

interface QuestionDayRow {
  quiz_day: number | string;
}

type ResourceItem = LearningPlanWeek["resources"][number];

const StudentLearningPath = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const {
    courseName,
    currentWeek,
    lessonPlan,
    planLoading,
    lessonPlanPublished,
    lessonPlanError,
  } = useLearningPlan();

  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([currentWeek]);
  useEffect(() => {
    setExpandedWeeks((prev) => (prev.includes(currentWeek) ? prev : [...prev, currentWeek]));
  }, [currentWeek]);

  const activityDoneStorageKey = user?.id ? `student:activity-done:${user.id}` : null;
  const [activityDone, setActivityDone] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(activityDoneStorageKey || "");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (!activityDoneStorageKey) return;
    try {
      window.localStorage.setItem(activityDoneStorageKey, JSON.stringify(activityDone));
    } catch {
      // ignore localStorage write errors
    }
  }, [activityDone, activityDoneStorageKey]);
  const toggleActivityDone = (id: string) => {
    setActivityDone((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [diagnosticTaken, setDiagnosticTaken] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enrolledCourseId || !user?.id) {
      setDiagnosticTaken(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("diagnostic_results")
        .select("id")
        .eq("student_id", user.id)
        .eq("course_id", enrolledCourseId)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Diagnostic status load error:", error);
        setDiagnosticTaken(false);
        return;
      }
      setDiagnosticTaken(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolledCourseId, user?.id]);

  const [takenQuizzes, setTakenQuizzes] = useState<
    Record<number, { score: number; correctAnswers: number; totalQuestions: number; timeSpent: number }>
  >({});
  const [availableQuizDays, setAvailableQuizDays] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!enrolledCourseId || !user?.id) {
      setTakenQuizzes({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("assessment_results")
        .select("quiz_day, score, correct_answers, total_questions, time_spent")
        .eq("student_id", user.id)
        .eq("course_id", enrolledCourseId)
        .eq("mode", "daily_quiz");
      if (cancelled) return;
      if (error) {
        console.error("Taken quizzes load error:", error);
        setTakenQuizzes({});
        return;
      }
      const map: Record<number, { score: number; correctAnswers: number; totalQuestions: number; timeSpent: number }> = {};
      (data || []).forEach((r: any) => {
        if (r.quiz_day != null) {
          const day = Number(r.quiz_day);
          const score = Number(r.score) || 0;
          if (!map[day] || score > map[day].score) {
            map[day] = {
              score,
              correctAnswers: Number(r.correct_answers) || 0,
              totalQuestions: Number(r.total_questions) || 0,
              timeSpent: Number(r.time_spent) || 0,
            };
          }
        }
      });
      setTakenQuizzes(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolledCourseId, user?.id]);

  useEffect(() => {
    if (!enrolledCourseId) {
      setAvailableQuizDays(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("quiz_day")
        .eq("course_id", enrolledCourseId)
        .eq("mode", "daily_quiz")
        .not("quiz_day", "is", null);
      if (cancelled) return;
      if (error) {
        console.error("Available quiz days load error:", error);
        setAvailableQuizDays(new Set());
        return;
      }
      const days = new Set<number>();
      (data || []).forEach((r: any) => {
        if (r.quiz_day != null) days.add(Number(r.quiz_day));
      });
      setAvailableQuizDays(days);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolledCourseId]);

  const [quizDialog, setQuizDialog] = useState<{ open: boolean; day: number | null }>({ open: false, day: null });
  const [diagGate, setDiagGate] = useState<{ open: boolean; context: string }>({ open: false, context: "" });

  const attemptOpenQuiz = (day: number) => {
    if (diagnosticTaken === false) {
      setDiagGate({ open: true, context: "Weekly quizzes unlock once you've completed the diagnostic." });
      return;
    }
    setQuizDialog({ open: true, day });
  };

  const toggleWeek = (week: number) => {
    setExpandedWeeks((prev) => (prev.includes(week) ? prev.filter((w) => w !== week) : [...prev, week]));
  };

  return (
    <div className="p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Learning Path</h1>
        {courseName && <p className="mt-1 text-sm text-muted-foreground">{courseName}</p>}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" /> Your Learning Path
            </CardTitle>
            <CardDescription>Your personalized learning path with units, outcomes, and activities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {planLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading learning path...</p>
            ) : !lessonPlanPublished ? (
              <div className="text-center py-6 space-y-1">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
                {lessonPlanError ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Learning path is being updated</p>
                    <p className="text-xs text-muted-foreground">Please refresh in a moment. If this keeps showing, let your professor know.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Learning path not yet available</p>
                    <p className="text-xs text-muted-foreground">Your professor hasn't published the learning path yet. You're currently on Unit {currentWeek}.</p>
                  </>
                )}
              </div>
            ) : lessonPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No units are visible yet — check back soon</p>
            ) : (
              lessonPlan.map((dp) => {
                const isExpanded = expandedWeeks.includes(dp.day);
                const desc = dp.description || "";
                const outcomesMatch = desc.match(/Learning Outcomes:\s*([\s\S]*?)(?=Concepts:|Teaching Strategies:|$)/i);
                const outcomes = outcomesMatch?.[1]?.trim().replace(/\*\*/g, "") || "";

                const activities = Array.isArray(dp.resources) ? dp.resources : [];
                const quizTaken = takenQuizzes[dp.day];
                const quizPublished = availableQuizDays.has(dp.day);
                const quizPassed = !!(quizTaken && quizTaken.score > 50);
                const quizTakenAny = !!quizTaken;
                const quizDone = !quizPublished || quizPassed;
                const activitiesDoneCount = activities.filter((r: any) => activityDone[r.id]).length;
                const quizCounts = quizPublished ? 1 : 0;
                const totalCount = activities.length + quizCounts;
                const doneCount = activitiesDoneCount + (quizPublished && quizTakenAny ? 1 : 0);
                const allActivitiesDone = activities.length === 0 || activitiesDoneCount === activities.length;
                const isComplete = totalCount > 0 && allActivitiesDone && !!quizDone;
                const status: "complete" | "in_progress" | "upcoming" = isComplete
                  ? "complete"
                  : dp.day > currentWeek
                  ? "upcoming"
                  : "in_progress";

                const statusStyles = {
                  complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  in_progress: "bg-primary/15 text-primary",
                  upcoming: "bg-muted text-muted-foreground",
                }[status];
                const statusLabel = { complete: "COMPLETE", in_progress: "IN PROGRESS", upcoming: "UPCOMING" }[status];

                const avatarStyles = {
                  complete: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                  in_progress: "bg-primary/10 text-primary border-primary/30",
                  upcoming: "bg-muted text-muted-foreground border-border",
                }[status];

                return (
                  <div key={dp.id || dp.day} className={`rounded-lg border ${isExpanded ? "border-primary/20" : ""}`}>
                    <button
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleWeek(dp.day)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${avatarStyles}`}>
                          {status === "complete" ? (
                            <Check className="h-5 w-5" strokeWidth={3} />
                          ) : status === "upcoming" ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <span className="text-xs font-semibold">{dp.day}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unit {dp.day}</span>
                            <span className="text-sm font-semibold truncate">{dp.topic}</span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusStyles}`}>
                              {statusLabel}
                            </span>
                          </div>
                          {totalCount > 0 && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                {activities.map((r: any, i: number) => {
                                  const done = !!activityDone[r.id];
                                  const isLast = !quizPublished && i === activities.length - 1;
                                  const cls = done
                                    ? isComplete && isLast
                                      ? "bg-emerald-500"
                                      : "bg-primary"
                                    : "bg-muted-foreground/25";
                                  return <span key={r.id || i} className={`h-2 w-2 rounded-full ${cls}`} />;
                                })}
                                {quizPublished && (
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      quizTakenAny
                                        ? isComplete
                                          ? "bg-emerald-500"
                                          : "bg-primary"
                                        : "bg-muted-foreground/25"
                                    }`}
                                    title="Weekly quiz"
                                  />
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {doneCount} / {totalCount} done
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {outcomes && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Learning Outcomes</p>
                            <ul className="space-y-1">
                              {parseList(outcomes).map((item, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {dp.resources && dp.resources.length > 0 && (() => {
                          const conceptGroups = new Map<string, any[]>();
                          for (const r of dp.resources) {
                            const key = r.concept || "General";
                            if (!conceptGroups.has(key)) conceptGroups.set(key, []);
                            conceptGroups.get(key)!.push(r);
                          }
                          return (
                            <div className="space-y-3">
                              {Array.from(conceptGroups.entries()).map(([concept, activities]) => (
                                <div key={concept}>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="h-4 w-1 rounded-full bg-primary/60" />
                                    <p className="text-sm font-semibold text-foreground">{concept}</p>
                                  </div>
                                  <div className="space-y-1.5 pl-3 border-l-2 border-muted ml-0.5">
                                    {activities.map((r: any, i: number) => {
                                      const hasUrl = typeof r.url === "string" && r.url.length > 0;
                                      const done = !!activityDone[r.id];
                                      const toggleBtn = (
                                        <button
                                          type="button"
                                          aria-label={done ? "Mark as not done" : "Mark as done"}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toggleActivityDone(r.id);
                                          }}
                                          className={`flex h-6 w-6 items-center justify-center rounded-full border shrink-0 transition-colors ${
                                            done
                                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                              : "bg-background border-muted-foreground/30 text-transparent hover:text-muted-foreground hover:border-muted-foreground/60"
                                          }`}
                                        >
                                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                        </button>
                                      );
                                      const inner = (
                                        <>
                                          {toggleBtn}
                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`text-sm font-medium ${
                                                done
                                                  ? "line-through text-muted-foreground"
                                                  : hasUrl
                                                  ? "text-primary group-hover:underline"
                                                  : ""
                                              }`}
                                            >
                                              {r.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{r.action}</p>
                                          </div>
                                          <Badge variant="outline" className="text-[10px] shrink-0">
                                            {r.type}
                                          </Badge>
                                          {r.type === "coding-exercise" && (
                                            <Badge variant="secondary" className="text-[10px] shrink-0">
                                              Optional
                                            </Badge>
                                          )}
                                        </>
                                      );
                                      return hasUrl ? (
                                        <a
                                          key={r.id || i}
                                          href={r.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="group flex items-center gap-3 rounded-lg bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
                                        >
                                          {inner}
                                        </a>
                                      ) : (
                                        <div key={r.id || i} className="flex items-center gap-3 rounded-lg bg-muted/20 p-2.5">
                                          {inner}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {(() => {
                          if (!availableQuizDays.has(dp.day)) {
                            return (
                              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-3 flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">Quiz not yet available for this unit.</p>
                              </div>
                            );
                          }
                          const taken = takenQuizzes[dp.day];
                          return (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-sm font-medium">Unit {dp.day} Quiz</p>
                                  <div className="group">
                                    <p className="text-xs text-muted-foreground">
                                      {taken
                                        ? `Completed — ${taken.score}%`
                                        : "Optional — one attempt only"}
                                    </p>
                                    {taken && (
                                      <div className="mt-1 space-y-0.5 block sm:hidden sm:group-hover:block sm:group-hover:animate-fade-in">
                                        <p className="text-[10px] text-muted-foreground">Score accounts for question difficulty, accuracy, and time.</p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {taken.correctAnswers}/{taken.totalQuestions} correct ({accuracyPct(taken.correctAnswers, taken.totalQuestions)}%)
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">{formatAvgTime(taken.timeSpent, taken.totalQuestions)}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {taken ? (
                                <Button size="sm" variant="outline" disabled>
                                  Quiz completed
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (takenQuizzes[dp.day]) return;
                                    attemptOpenQuiz(dp.day);
                                  }}
                                >
                                  Take Quiz
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </motion.div>

      <WeeklyQuizDialog
        open={quizDialog.open}
        onOpenChange={(o) => setQuizDialog((s) => ({ ...s, open: o }))}
        courseId={enrolledCourseId}
        studentId={user?.id ?? null}
        day={quizDialog.day}
        numQuestions={taSettings.quizNumQuestions || 5}
        timeLimitMinutes={taSettings.quizTimeLimit || 10}
      />
      <DiagnosticGateDialog
        open={diagGate.open}
        onOpenChange={(o) => setDiagGate((s) => ({ ...s, open: o }))}
        courseId={enrolledCourseId}
        context={diagGate.context}
      />
    </div>
  );
};

export default StudentLearningPath;
