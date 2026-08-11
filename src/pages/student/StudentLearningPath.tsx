import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { useAuth } from "@/contexts/AuthContext";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useLearningPlan } from "@/hooks/useLearningPlan";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen } from "lucide-react";
import WeeklyQuizDialog from "@/components/WeeklyQuizDialog";
import DiagnosticGateDialog from "@/components/student/DiagnosticGateDialog";
import { fetchVoidCounts } from "@/lib/attemptVoids";
import UnitPathwayCard from "@/components/student/UnitPathwayCard";
import { useUnitReadiness, READINESS_THRESHOLD } from "@/hooks/useUnitReadiness";
import { useUnitProgress } from "@/hooks/useUnitProgress";

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

const StudentLearningPath = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const {
    courseName,
    currentWeek,
    totalWeeks,
    lessonPlan,
    planLoading,
    lessonPlanPublished,
    lessonPlanError,
  } = useLearningPlan();

  const { readinessByUnit, weakConceptsByUnit } = useUnitReadiness(enrolledCourseId, lessonPlan);
  const { studiedByUnit, practisedByUnit } = useUnitProgress(enrolledCourseId, lessonPlan);

  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([currentWeek]);

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
      (data || []).forEach((r: QuizResultRow) => {
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
      (data || []).forEach((r: QuestionDayRow) => {
        if (r.quiz_day != null) days.add(Number(r.quiz_day));
      });
      setAvailableQuizDays(days);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolledCourseId]);

  // Voided (browser-lock) attempts per week. One void is forgiven; a second
  // locks the week until the professor resets it.
  const [voidCounts, setVoidCounts] = useState<Record<number, number>>({});

  const loadVoids = useCallback(async () => {
    if (!enrolledCourseId || !user?.id) {
      setVoidCounts({});
      return;
    }
    const byKey = await fetchVoidCounts({
      studentId: user.id,
      courseId: enrolledCourseId,
      assessmentType: "weekly_quiz",
    });
    const map: Record<number, number> = {};
    Object.entries(byKey).forEach(([key, count]) => {
      if (key !== "") map[Number(key)] = count;
    });
    setVoidCounts(map);
  }, [enrolledCourseId, user?.id]);

  useEffect(() => {
    void loadVoids();
  }, [loadVoids]);

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

  const readyUnitCount = lessonPlan.filter((w) => (readinessByUnit[w.day] ?? 0) >= READINESS_THRESHOLD).length;
  const progressPct = lessonPlan.length > 0
    ? Math.max(0, Math.min(100, Math.round((readyUnitCount / lessonPlan.length) * 100)))
    : 0;

  // Current unit = first unit whose quiz hasn't been taken, else the date-derived week.
  const firstUnfinished = lessonPlan.find((w) => !takenQuizzes[w.day]);
  const focusUnit = firstUnfinished
    ?? lessonPlan.find((w) => w.day === currentWeek)
    ?? lessonPlan[lessonPlan.length - 1]
    ?? null;
  const displayedUnit = focusUnit?.day ?? Math.max(1, Math.min(totalWeeks, currentWeek));

  // Expand the focus unit once it is known.
  useEffect(() => {
    if (!focusUnit) return;
    setExpandedWeeks((prev) => (prev.includes(focusUnit.day) ? prev : [...prev, focusUnit.day]));
  }, [focusUnit?.day]);

  const goToStudy = (concept: string, intent: "start" | "weak") => {
    navigate(`/student/chat?newchat=true&mode=learning&concept=${encodeURIComponent(concept)}&intent=${intent}`);
  };
  const goToPractice = (topic: string) => {
    navigate(`/student/chat?practice=1&topic=${encodeURIComponent(topic)}`);
  };

  return (
    <div className="p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Learning Path</h1>
        {courseName && <p className="mt-1 text-sm text-muted-foreground">{courseName}</p>}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Course Progress</p>
              </div>
              <span className="text-sm text-muted-foreground">Unit {displayedUnit} of {totalWeeks}</span>
            </div>
            <Progress value={progressPct} className="mb-1 h-2" />
            <p className="text-xs text-muted-foreground">
              {lessonPlan.length === 0
                ? "No units published yet"
                : `${readyUnitCount} of ${lessonPlan.length} units at ${READINESS_THRESHOLD}%+ readiness`}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-3"
      >
        {planLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading learning path...</p>
        ) : !lessonPlanPublished ? (
          <Card>
            <CardContent className="space-y-1 py-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
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
            </CardContent>
          </Card>
        ) : lessonPlan.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No units are visible yet — check back soon
            </CardContent>
          </Card>
        ) : (
          lessonPlan.map((unit) => {
            const taken = takenQuizzes[unit.day];
            const voids = voidCounts[unit.day] ?? 0;
            const weak = weakConceptsByUnit[unit.day] ?? [];
            return (
              <UnitPathwayCard
                key={unit.id || unit.day}
                unitNumber={unit.day}
                topic={unit.topic}
                totalUnits={lessonPlan.length}
                expanded={expandedWeeks.includes(unit.day)}
                onToggle={() => toggleWeek(unit.day)}
                studied={!!studiedByUnit[unit.day]}
                practised={!!practisedByUnit[unit.day]}
                quizTaken={!!taken}
                quizScore={taken?.score}
                quizAvailable={availableQuizDays.has(unit.day)}
                quizLocked={voids >= 2}
                quizFinalAttempt={voids === 1}
                readiness={readinessByUnit[unit.day] ?? 0}
                weakConcepts={weak}
                resources={Array.isArray(unit.resources) ? unit.resources : []}
                activityDone={activityDone}
                onToggleActivity={toggleActivityDone}
                onStudy={() =>
                  goToStudy(
                    (taken ? weak[0] : unit.concepts?.[0]?.name) || unit.topic,
                    taken ? "weak" : "start",
                  )
                }
                onPractice={() =>
                  goToPractice(taken && weak.length > 0 ? weak.join(", ") : unit.topic)
                }
                onTakeQuiz={() => attemptOpenQuiz(unit.day)}
                onGoToNextUnit={() => {
                  const next = unit.day + 1;
                  setExpandedWeeks((prev) => (prev.includes(next) ? prev : [...prev, next]));
                }}
              />
            );
          })
        )}
      </motion.div>

      <WeeklyQuizDialog
        open={quizDialog.open}
        onOpenChange={(o) => setQuizDialog((s) => ({ ...s, open: o }))}
        courseId={enrolledCourseId}
        studentId={user?.id ?? null}
        day={quizDialog.day}
        onVoided={() => void loadVoids()}
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
