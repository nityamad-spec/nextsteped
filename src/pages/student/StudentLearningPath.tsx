import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";

import { useAuth } from "@/contexts/AuthContext";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useCodingAccess } from "@/hooks/useCodingAccess";
import { useLearningPlan } from "@/hooks/useLearningPlan";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import WeeklyQuizDialog from "@/components/WeeklyQuizDialog";
import DiagnosticGateDialog from "@/components/student/DiagnosticGateDialog";
import { fetchVoidCounts } from "@/lib/attemptVoids";
import UnitPathRail from "@/components/student/UnitPathRail";
import UnitDetailPanel from "@/components/student/UnitDetailPanel";
import { useUnitReadiness, READINESS_THRESHOLD } from "@/hooks/useUnitReadiness";
import { useUnitProgress } from "@/hooks/useUnitProgress";
import { fetchPublishedExercises, type PublishedCodingExercise } from "@/lib/codingExercises";
import SoftSkillsUnitCard, { type SoftSkillsModuleView } from "@/components/student/SoftSkillsUnitCard";

interface QuizResultRow {
  quiz_day: number | string;
  score: number | string;
  correct_answers: number | string;
  total_questions: number | string;
  time_spent: number | string;
  created_at?: string | null;
}

interface QuestionDayRow {
  quiz_day: number | string;
}

/** Slim ring showing overall course progress. */
const ProgressRing = ({ value }: { value: number }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} className="fill-none stroke-muted" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.max(0, Math.min(100, value))) / 100}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{value}%</span>
    </div>
  );
};

const StudentLearningPath = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const enrolledCourseId = useEnrolledCourseId();
  // Coding-exercise resources stay hidden unless an admin approved coding access.
  const { isApproved: codingApproved } = useCodingAccess(enrolledCourseId);
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

  const { readinessByUnit, weakConceptsByUnit, conceptsByUnit } = useUnitReadiness(enrolledCourseId, lessonPlan);
  // Latest weekly-quiz attempt per unit — study/practice only count after this.
  const [quizTakenAtByUnit, setQuizTakenAtByUnit] = useState<Record<number, string | undefined>>({});
  // First unit not yet at the readiness threshold — unattributed chats credit this unit.
  const fallbackStudyUnit =
    lessonPlan.find((w) => (readinessByUnit[w.day] ?? 0) < READINESS_THRESHOLD)?.day ?? null;
  const { studiedByUnit, practisedByUnit } = useUnitProgress(
    enrolledCourseId,
    lessonPlan,
    fallbackStudyUnit,
    quizTakenAtByUnit,
  );

  // The unit whose detail panel is open. Null until the focus unit resolves.
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);

  // Deep link from the concept mastery map: ?unit=N opens that unit's panel.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedUnit = Number(searchParams.get("unit")) || null;
  useEffect(() => {
    if (!requestedUnit || lessonPlan.length === 0) return;
    if (!lessonPlan.some((w) => w.day === requestedUnit)) return;
    setSelectedUnit(requestedUnit);
    const next = new URLSearchParams(searchParams);
    next.delete("unit");
    next.delete("concept");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedUnit, lessonPlan.length]);

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
      setQuizTakenAtByUnit({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("assessment_results")
        .select("quiz_day, score, correct_answers, total_questions, time_spent, created_at")
        .eq("student_id", user.id)
        .eq("course_id", enrolledCourseId)
        .eq("mode", "daily_quiz");
      if (cancelled) return;
      if (error) {
        console.error("Taken quizzes load error:", error);
        setTakenQuizzes({});
        setQuizTakenAtByUnit({});
        return;
      }
      const map: Record<number, { score: number; correctAnswers: number; totalQuestions: number; timeSpent: number }> = {};
      const takenAt: Record<number, string | undefined> = {};
      (data || []).forEach((r: QuizResultRow) => {
        if (r.quiz_day != null) {
          const day = Number(r.quiz_day);
          const score = Number(r.score) || 0;
          if (r.created_at && (!takenAt[day] || new Date(r.created_at) > new Date(takenAt[day] as string))) {
            takenAt[day] = r.created_at;
          }
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
      setQuizTakenAtByUnit(takenAt);
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

  // Published coding exercises per unit (coding/lab units only), plus the
  // student's per-exercise completion (terminal opened for that exercise).
  const [exercisesByUnit, setExercisesByUnit] = useState<Record<number, PublishedCodingExercise[]>>({});
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());
  const hasCodingUnits = lessonPlan.some((w) => w.is_coding_week);
  useEffect(() => {
    if (!enrolledCourseId || !codingApproved || !hasCodingUnits || !user?.id) {
      setExercisesByUnit({});
      setCompletedExerciseIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [rows, progress] = await Promise.all([
          fetchPublishedExercises(enrolledCourseId),
          supabase
            .from("coding_exercise_progress")
            .select("exercise_id")
            .eq("student_id", user.id)
            .eq("course_id", enrolledCourseId),
        ]);
        if (cancelled) return;
        const map: Record<number, PublishedCodingExercise[]> = {};
        rows.forEach((r) => {
          (map[r.week_number] ??= []).push(r);
        });
        setExercisesByUnit(map);
        if (!progress.error) {
          setCompletedExerciseIds(new Set((progress.data ?? []).map((r) => r.exercise_id)));
        }
      } catch (err) {
        if (!cancelled) console.error("Coding exercises load error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolledCourseId, codingApproved, hasCodingUnits, user?.id]);

  // Published Soft Skills modules (employment-pathway courses only). RLS keeps
  // this empty for academic courses, so no course-type lookup is needed here.
  const [softSkills, setSoftSkills] = useState<SoftSkillsModuleView[]>([]);
  useEffect(() => {
    if (!enrolledCourseId) {
      setSoftSkills([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("course_soft_skills")
        .select("id, title, summary, outcomes, activities")
        .eq("course_id", enrolledCourseId)
        .eq("published", true)
        .order("position", { ascending: true });
      if (cancelled || error) return;
      setSoftSkills(
        (data ?? []).map((row: any) => ({
          id: row.id,
          title: row.title ?? "",
          summary: row.summary ?? "",
          outcomes: Array.isArray(row.outcomes) ? row.outcomes : [],
          activities: Array.isArray(row.activities) ? row.activities : [],
        })),
      );
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

  const openUnitDay = selectedUnit ?? focusUnit?.day ?? null;
  const openUnit = lessonPlan.find((w) => w.day === openUnitDay) ?? focusUnit;

  const goToStudy = (concept: string, intent: "start" | "weak") => {
    navigate(`/student/chat?newchat=true&mode=learning&concept=${encodeURIComponent(concept)}&intent=${intent}`);
  };
  const goToPractice = (unitDay: number, topic: string) => {
    // Coding-approved courses practise in the code terminal; everyone else
    // keeps the AI practice-questions flow.
    if (codingApproved) {
      // Coding/lab weeks practise freeform (blank terminal) — exercises get
      // their own step cards. Teaching weeks keep the unit deep link.
      const isCodingWeek = !!lessonPlan.find((w) => w.day === unitDay)?.is_coding_week;
      navigate(`/student/chat?terminal=1&unit=${unitDay}${isCodingWeek ? "&freeform=1" : ""}`);
      return;
    }
    navigate(`/student/chat?practice=1&topic=${encodeURIComponent(topic)}`);
  };

  const doneDays = new Set(
    lessonPlan.filter((w) => (readinessByUnit[w.day] ?? 0) >= READINESS_THRESHOLD).map((w) => w.day),
  );
  const unitLabels: Record<number, string> = {};
  lessonPlan.forEach((w) => {
    unitLabels[w.day] = w.topic;
  });

  const openTaken = openUnit ? takenQuizzes[openUnit.day] : undefined;
  const openWeak = openUnit ? (weakConceptsByUnit[openUnit.day] ?? []) : [];
  const openVoids = openUnit ? (voidCounts[openUnit.day] ?? 0) : 0;

  /** Rail + detail panel for a set of unit numbers (whole course, or one stage). */
  const renderUnitArea = (days: number[]) => {
    if (days.length === 0) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No units in this stage yet.
          </CardContent>
        </Card>
      );
    }
    const day = openUnitDay !== null && days.includes(openUnitDay) ? openUnitDay : days[0];
    const unit = lessonPlan.find((w) => w.day === day);
    if (!unit) return null;
    const taken = takenQuizzes[unit.day];
    const weak = weakConceptsByUnit[unit.day] ?? [];
    const voids = voidCounts[unit.day] ?? 0;
    const nextDay = days[days.indexOf(unit.day) + 1];

    return (
      <div className="space-y-4">
        <UnitPathRail
          days={days}
          labels={unitLabels}
          doneDays={doneDays}
          currentDay={days.includes(displayedUnit) ? displayedUnit : days[0]}
          selectedDay={unit.day}
          onSelect={(d) => setSelectedUnit(d)}
        />
        <UnitDetailPanel
          key={unit.day}
          unitNumber={unit.day}
          topic={unit.topic}
          totalUnits={lessonPlan.length}
          studied={!!studiedByUnit[unit.day]}
          practised={!!practisedByUnit[unit.day]}
          quizTaken={!!taken}
          isCodingWeek={!!unit.is_coding_week}
          exercises={exercisesByUnit[unit.day] ?? []}
          completedExerciseIds={completedExerciseIds}
          onOpenExercise={(ex) => navigate(`/student/chat?terminal=1&unit=${unit.day}&exercise=${ex.id}`)}
          quizScore={taken?.score}
          quizAvailable={availableQuizDays.has(unit.day)}
          quizLocked={voids >= 2}
          quizFinalAttempt={voids === 1}
          readiness={readinessByUnit[unit.day] ?? 0}
          weakConcepts={weak}
          concepts={conceptsByUnit[unit.day] ?? []}
          onStudyConcept={(concept, isWeak) => goToStudy(concept, isWeak && !!taken ? "weak" : "start")}
          resources={
            unit.is_coding_week
              ? []
              : (Array.isArray(unit.resources) ? unit.resources : []).filter(
                  (r) => codingApproved || r?.type !== "coding-exercise",
                )
          }
          activityDone={activityDone}
          onToggleActivity={toggleActivityDone}
          onStudy={() =>
            goToStudy(
              (taken ? weak[0] : unit.concepts?.[0]?.name) || unit.topic,
              taken ? "weak" : "start",
            )
          }
          onPractice={() => goToPractice(unit.day, taken && weak.length > 0 ? weak.join(", ") : unit.topic)}
          practiceViaTerminal={codingApproved}
          onTakeQuiz={() => attemptOpenQuiz(unit.day)}
          onGoToNextUnit={() => nextDay && setSelectedUnit(nextDay)}
        />
      </div>
    );
  };

  const pathway = isEmployment
    ? buildPathwayStages({
        days: lessonPlan.map((w) => w.day),
        stageByDay,
        hoursByDay,
        doneDays,
        softSkillsCount: softSkills.length,
        softSkillsHours,
        capstoneCount: projectLabs.length,
        capstoneHours,
      })
    : null;

  return (
    <div className="p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Learning Path</h1>
        {courseName && <p className="mt-1 text-sm text-muted-foreground">{courseName}</p>}
      </motion.div>

      {!isEmployment && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <ProgressRing value={progressPct} />
              <div className="min-w-0">
                <p className="font-heading text-base font-bold">
                  You're on Unit {displayedUnit} — {readyUnitCount} of {lessonPlan.length || totalWeeks} units complete
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Reach {READINESS_THRESHOLD}% mastery in a unit to unlock the next. Study and practice keep raising your
                  mastery.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-4"
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
        ) : pathway ? (
          <PathwayStageList
            trackLabel={targetRole || courseName || "Employment pathway"}
            totalHours={pathway.totalHours}
            overallPct={pathway.overallPct}
            stages={pathway.stages}
            onStageOpen={(stage) => {
              if (stage.days.length > 0 && (openUnitDay === null || !stage.days.includes(openUnitDay))) {
                setSelectedUnit(stage.days[0]);
              }
            }}
            renderStage={(stage) => {
              if (stage.kind === "foundations" || stage.kind === "advanced") {
                return renderUnitArea(stage.days);
              }
              if (stage.kind === "soft_skills") {
                return softSkills.length > 0 ? (
                  <SoftSkillsUnitCard modules={softSkills} onStudy={(title) => goToStudy(title, "start")} />
                ) : (
                  <Card>
                    <CardContent className="py-6 text-center text-sm text-muted-foreground">
                      Your professor hasn't published soft skills modules yet.
                    </CardContent>
                  </Card>
                );
              }
              return projectLabs.length > 0 ? (
                <div className="space-y-2">
                  {projectLabs.map((lab) => (
                    <Card key={lab.id}>
                      <CardContent className="flex items-center gap-3 p-4">
                        <FlaskConical className="h-4 w-4 flex-none text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{lab.title}</p>
                          {lab.summary && (
                            <p className="truncate text-sm text-muted-foreground">{lab.summary}</p>
                          )}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => navigate("/student/project-lab")}>
                          Open
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    Your professor hasn't published a capstone project yet.
                  </CardContent>
                </Card>
              );
            }}
          />
        ) : (
          <>
            {renderUnitArea(lessonPlan.map((w) => w.day))}
            {softSkills.length > 0 && (
              <SoftSkillsUnitCard modules={softSkills} onStudy={(title) => goToStudy(title, "start")} />
            )}
          </>
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
