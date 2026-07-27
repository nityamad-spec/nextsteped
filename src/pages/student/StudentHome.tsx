import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { useApp } from "@/contexts/AppContext";
import { useStudentStatus } from "@/hooks/useStudentStatus";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useLearningPlan } from "@/hooks/useLearningPlan";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, BookOpen, ArrowRight, MessageSquare, ClipboardCheck, Check, Sparkles, Compass } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import WeeklyQuizDialog from "@/components/WeeklyQuizDialog";
import DiagnosticGateDialog from "@/components/student/DiagnosticGateDialog";


/* Concepts are loaded from the DB for the student's enrolled course.
   Mastery is a uniform "Not explored" placeholder until real data is wired. */

type MasteryLevel = "not_explored" | "beginner" | "developing" | "proficient" | "expert";

const getMasteryLevel = (attempted: number, score: number): MasteryLevel => {
  if (attempted === 0) return "not_explored";
  if (score <= 0.25) return "beginner";
  if (score <= 0.5) return "developing";
  if (score <= 0.75) return "proficient";
  return "expert";
};

const MASTERY_LABEL: Record<MasteryLevel, string> = {
  not_explored: "Not explored",
  beginner: "Beginner",
  developing: "Developing",
  proficient: "Proficient",
  expert: "Expert",
};

const MASTERY_TILE_CLASS: Record<MasteryLevel, string> = {
  not_explored: "bg-background border text-muted-foreground",
  beginner: "bg-destructive/15 text-foreground border border-destructive/30",
  developing: "bg-amber-500/15 text-foreground border border-amber-500/30",
  proficient: "bg-primary/25 text-foreground",
  expert: "bg-primary text-primary-foreground",
};

const MASTERY_SWATCH_CLASS: Record<MasteryLevel, string> = {
  not_explored: "bg-background border",
  beginner: "bg-destructive/30",
  developing: "bg-amber-500/40",
  proficient: "bg-primary/25",
  expert: "bg-primary",
};

const accuracyPct = (correct: number, total: number) =>
  total > 0 ? Math.round((correct / total) * 100) : 0;

const formatAvgTime = (seconds: number, totalQuestions: number) => {
  if (totalQuestions <= 0 || seconds <= 0) return "—";
  return `${Math.round(seconds / totalQuestions)}s/question`;
};

// ISO year+week key so the "opened learning path this week" flag rolls over weekly.
const isoYearWeek = (d: Date = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};
const lpOpenedKey = (courseId: string | null | undefined) =>
  `student:lp-opened:${courseId ?? "none"}:${isoYearWeek()}`;
const hasOpenedLearningPathThisWeek = (courseId: string | null | undefined) => {
  try { return !!localStorage.getItem(lpOpenedKey(courseId)); } catch { return false; }
};
const markLearningPathOpened = (courseId: string | null | undefined) => {
  try { localStorage.setItem(lpOpenedKey(courseId), "1"); } catch { /* ignore */ }
};


const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const { profileData } = useStudentStatus();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { courseName: courseNameFromPlan, currentWeek, totalWeeks, lessonPlan, planLoading, lessonPlanPublished } = useLearningPlan();
  const courseName = courseNameFromPlan || currentCourse?.name || "";
  const displayName = profileData?.name || studentProfile?.name || "Student";

  const [concepts, setConcepts] = useState<{ id: string; name: string }[]>([]);
  const [quizDialog, setQuizDialog] = useState<{ open: boolean; day: number | null }>({ open: false, day: null });
  const [diagGate, setDiagGate] = useState<{ open: boolean; context: string }>({ open: false, context: "" });
  const [conceptMastery, setConceptMastery] = useState<Record<string, { score: number; attempted: number }>>({});
  const [courseMastery, setCourseMastery] = useState<number | null>(null);
  const [takenQuizzes, setTakenQuizzes] = useState<
    Record<number, { score: number; correctAnswers: number; totalQuestions: number; timeSpent: number }>
  >({});
  const [availableQuizDays, setAvailableQuizDays] = useState<Set<number>>(new Set());

  // Course Progress: weekly quizzes passed (score > 50%) / quizzes the professor has published
  const passedQuizCount = Object.values(takenQuizzes).filter((q) => q.score > 50).length;
  const publishedQuizCount = availableQuizDays.size;
  const progressPct = publishedQuizCount > 0
    ? Math.max(0, Math.min(100, Math.round((passedQuizCount / publishedQuizCount) * 100)))
    : 0;

  // Displayed unit = next unit after the last passed quiz, clamped to totalWeeks
  const lastPassedUnit = Object.entries(takenQuizzes)
    .filter(([, q]) => q.score > 50)
    .reduce((max, [day]) => Math.max(max, Number(day) || 0), 0);
  const displayedUnit = Math.max(1, Math.min(totalWeeks, lastPassedUnit + 1));

  useEffect(() => {
    if (!enrolledCourseId) { setConcepts([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("concepts")
        .select("id, concept_code, weight")
        .eq("course_id", enrolledCourseId)
        .order("weight", { ascending: false })
        .order("concept_code", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Concepts load error:", error);
        setConcepts([]);
        return;
      }
      setConcepts((data || []).map((c: any) => ({ id: String(c.id), name: String(c.concept_code) })));
    })();
    return () => { cancelled = true; };
  }, [enrolledCourseId]);

  // Load mastery for this student + course
  useEffect(() => {
    if (!enrolledCourseId || !user?.id) {
      setConceptMastery({});
      setCourseMastery(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: cm }, { data: courseM }] = await Promise.all([
        supabase
          .from("student_concept_mastery")
          .select("concept_id, mastery_score, questions_attempted")
          .eq("student_id", user.id)
          .eq("course_id", enrolledCourseId),
        supabase
          .from("student_course_mastery")
          .select("mastery_score")
          .eq("student_id", user.id)
          .eq("course_id", enrolledCourseId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const map: Record<string, { score: number; attempted: number }> = {};
      (cm || []).forEach((r: any) => {
        if (r.concept_id) {
          map[String(r.concept_id)] = {
            score: Number(r.mastery_score) || 0,
            attempted: Number(r.questions_attempted) || 0,
          };
        }
      });
      setConceptMastery(map);
      setCourseMastery(courseM?.mastery_score != null ? Number(courseM.mastery_score) : null);
    })();
    return () => { cancelled = true; };
  }, [enrolledCourseId, user?.id, quizDialog.open]);

  // Load taken weekly quizzes so we can lock attempts to one per week
  useEffect(() => {
    if (!enrolledCourseId || !user?.id) { setTakenQuizzes({}); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("assessment_results")
        .select("quiz_day, score, correct_answers, total_questions, time_spent")
        .eq("student_id", user.id)
        .eq("course_id", enrolledCourseId)
        .eq("mode", "daily_quiz");
      if (cancelled) return;
      if (error) { console.error("Taken quizzes load error:", error); setTakenQuizzes({}); return; }
      const map: Record<number, { score: number; correctAnswers: number; totalQuestions: number; timeSpent: number }> = {};
      (data || []).forEach((r: any) => {
        if (r.quiz_day != null) {
          const day = Number(r.quiz_day);
          const score = Number(r.score) || 0;
          // Keep the highest score in case any duplicates exist
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
    return () => { cancelled = true; };
  }, [enrolledCourseId, user?.id, quizDialog.open]);

  // Load which weeks actually have published quiz questions
  useEffect(() => {
    if (!enrolledCourseId) { setAvailableQuizDays(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("quiz_day")
        .eq("course_id", enrolledCourseId)
        .eq("mode", "daily_quiz")
        .not("quiz_day", "is", null);
      if (cancelled) return;
      if (error) { console.error("Available quiz days load error:", error); setAvailableQuizDays(new Set()); return; }
      const days = new Set<number>();
      (data || []).forEach((r: any) => { if (r.quiz_day != null) days.add(Number(r.quiz_day)); });
      setAvailableQuizDays(days);
    })();
    return () => { cancelled = true; };
  }, [enrolledCourseId]);

  // Has the student taken the diagnostic for this course?
  const [diagnosticTaken, setDiagnosticTaken] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enrolledCourseId || !user?.id) { setDiagnosticTaken(null); return; }
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
      if (error) { console.error("Diagnostic status load error:", error); setDiagnosticTaken(false); return; }
      setDiagnosticTaken(!!data);
    })();
    return () => { cancelled = true; };
  }, [enrolledCourseId, user?.id]);

  // Gate helpers: block assessment-scored surfaces until diagnostic is done.
  const attemptOpenQuiz = (day: number) => {
    if (diagnosticTaken === false) {
      setDiagGate({ open: true, context: "Weekly quizzes unlock once you've completed the diagnostic." });
      return;
    }
    setQuizDialog({ open: true, day });
  };
  const attemptExamMode = () => {
    if (diagnosticTaken === false) {
      setDiagGate({ open: true, context: "Practice exams unlock once you've completed the diagnostic." });
      return;
    }
    navigate("/student/chat?mode=exam");
  };


  // Dynamic "What to do next" — prioritised from real signals.
  const nextActionsLoading =
    planLoading || diagnosticTaken === null || (!!enrolledCourseId && concepts.length === 0 && lessonPlanPublished);

  type NextActionCategory =
    | "HEADS UP"
    | "DIAGNOSTIC"
    | "THIS WEEK'S QUIZ"
    | "STRENGTHEN"
    | "START THIS WEEK"
    | "REVIEW"
    | "PRACTICE"
    | "EXPLORE";
  type VisualCategory = "quiz" | "reading" | "continue" | "practice" | "heads-up";
  type BadgeTone = "neutral" | "green";
  type ButtonVariant = "default" | "outline";
  type NextAction = {
    icon: any;
    title: string;
    description: string;
    action: () => void;
    category: NextActionCategory;
    visualCategory: VisualCategory;
    badgeLabel: string;
    badgeTone: BadgeTone;
    metadata: string;
    buttonLabel: string;
    buttonVariant: ButtonVariant;
  };
  const nextActions: NextAction[] = [];

  // Build a lookup of concept_code -> concept id for the current course
  const conceptIdByName = new Map<string, string>();
  concepts.forEach((c) => conceptIdByName.set(c.name, c.id));

  // Concept ids that appear in any visible learning-path week
  const visibleConceptIds = new Set<string>();
  // Current-week concept names (in order) from the learning path
  const currentWeekConcepts: { id?: string; name: string }[] = [];
  lessonPlan.forEach((wk: any) => {
    (wk.concepts || []).forEach((c: any) => {
      const name = typeof c?.name === "string" ? c.name : "";
      const id = name ? conceptIdByName.get(name) : undefined;
      if (id) visibleConceptIds.add(id);
      if (wk.day === currentWeek && name) currentWeekConcepts.push({ id, name });
    });
  });

  const currentWeekRow = lessonPlan.find((wk: any) => wk.day === currentWeek);

  const quizQuestionCount = taSettings?.quizNumQuestions || 5;
  const quizTimeLimit = taSettings?.quizTimeLimit || 10;
  const quizMetadata = `${quizQuestionCount} questions · ${quizTimeLimit} min`;

  const deriveReadTime = (resource: { title?: string; description?: string }) => {
    const text = `${resource.title || ""} ${resource.description || ""}`;
    const match = text.match(/(\d+)\s*(?:min|minute|mins|minutes)/i);
    return match ? `${match[1]} min` : "~10 min";
  };

  // Rule 1 — no learning path published
  if (!lessonPlanPublished) {
    nextActions.push({
      icon: BookOpen,
      title: "Learning path not published yet",
      description: "Your professor hasn't published the learning path. Check back soon.",
      action: () => { /* no-op */ },
      category: "HEADS UP",
      visualCategory: "heads-up",
      badgeLabel: "Heads up",
      badgeTone: "neutral",
      metadata: "",
      buttonLabel: "View learning path",
      buttonVariant: "outline",
    });
  } else {
    // Rule 2 — diagnostic not taken (always first)
    if (diagnosticTaken === false) {
      nextActions.push({
        icon: Brain,
        title: "Take the diagnostic quiz",
        description: "Helps the assistant calibrate to your level",
        action: () => navigate(`/student/diagnostic?course=${enrolledCourseId ?? ""}`),
        category: "DIAGNOSTIC",
        visualCategory: "quiz",
        badgeLabel: "Diagnostic",
        badgeTone: "neutral",
        metadata: quizMetadata,
        buttonLabel: "Start quiz",
        buttonVariant: "default",
      });
    }

    // Rule 3 — Weekly Quiz slot: this week's untaken quiz, else earliest missed earlier quiz
    const currentWeekQuizAvailable = availableQuizDays.has(currentWeek) && !takenQuizzes[currentWeek];
    const earlierWeekNumbers = lessonPlan
      .map((wk: any) => Number(wk.day))
      .filter((d: number) => Number.isFinite(d) && d < currentWeek)
      .sort((a: number, b: number) => a - b);
    const missedEarlier = earlierWeekNumbers.find(
      (w: number) => availableQuizDays.has(w) && !takenQuizzes[w],
    );
    if (currentWeekQuizAvailable) {
      nextActions.push({
        icon: ClipboardCheck,
        title: `${currentWeekRow?.topic || `Week ${currentWeek}`}`,
        description: "Quick check-in on this week's concepts",
        action: () => attemptOpenQuiz(currentWeek),
        category: "THIS WEEK'S QUIZ",
        visualCategory: "quiz",
        badgeLabel: "Quiz",
        badgeTone: "neutral",
        metadata: quizMetadata,
        buttonLabel: "Start quiz",
        buttonVariant: "default",
      });
    } else if (missedEarlier != null) {
      nextActions.push({
        icon: ClipboardCheck,
        title: `Week ${missedEarlier} quiz`,
        description: "You haven't taken this one yet",
        action: () => attemptOpenQuiz(missedEarlier),
        category: "REVIEW",
        visualCategory: "quiz",
        badgeLabel: "Quiz",
        badgeTone: "neutral",
        metadata: quizMetadata,
        buttonLabel: "Start quiz",
        buttonVariant: "default",
      });
    }

    // Rule 4 — Chatbot slot (smart fallback: weakest touched → first unexplored current-week → generic)
    const touchedVisible = Object.entries(conceptMastery)
      .filter(([id, m]) => visibleConceptIds.has(id) && m.attempted > 0)
      .sort(([, a], [, b]) => a.score - b.score);
    const weakest = touchedVisible.length > 0
      ? concepts.find((c) => c.id === touchedVisible[0][0])
      : undefined;
    const unexploredThisWeek = currentWeekConcepts.find(
      (c) => !c.id || !conceptMastery[c.id] || conceptMastery[c.id].attempted === 0,
    );
    if (weakest) {
      nextActions.push({
        icon: Sparkles,
        title: weakest.name,
        description: "Revisit this concept in the Study Chat",
        action: () => navigate(`/student/chat?newchat=true&concept=${encodeURIComponent(weakest.name)}`),
        category: "STRENGTHEN",
        visualCategory: "continue",
        badgeLabel: "Continue learning",
        badgeTone: "green",
        metadata: "Based on your mastery",
        buttonLabel: "Review with TA",
        buttonVariant: "outline",
      });
    } else if (unexploredThisWeek) {
      nextActions.push({
        icon: BookOpen,
        title: unexploredThisWeek.name,
        description: `Week ${currentWeek} — open a new chat to dig in`,
        action: () => navigate(`/student/chat?newchat=true&concept=${encodeURIComponent(unexploredThisWeek.name)}`),
        category: "START THIS WEEK",
        visualCategory: "continue",
        badgeLabel: "Continue learning",
        badgeTone: "green",
        metadata: `Unit ${currentWeek}`,
        buttonLabel: "Review with TA",
        buttonVariant: "outline",
      });
    } else {
      nextActions.push({
        icon: MessageSquare,
        title: "Open the Study Chat",
        description: "Ask a question or explore a concept",
        action: () => navigate("/student/chat?newchat=true"),
        category: "EXPLORE",
        visualCategory: "continue",
        badgeLabel: "Continue learning",
        badgeTone: "green",
        metadata: "Based on your last session",
        buttonLabel: "Review with TA",
        buttonVariant: "outline",
      });
    }

    // Rule 5 — Reading slot (only if unread + student hasn't opened learning path this week)
    const currentWeekResources = Array.isArray(currentWeekRow?.resources) ? currentWeekRow.resources : [];
    const readingResource = currentWeekResources.find(
      (r: any) => typeof r?.type === "string" && /reading|material|article|text/i.test(r.type),
    ) || currentWeekResources[0];
    if (readingResource && !hasOpenedLearningPathThisWeek(enrolledCourseId)) {
      nextActions.push({
        icon: BookOpen,
        title: `Read: ${readingResource.title || "Course reading"}`,
        description: readingResource.description || "Prepare for the next part of the unit with a short guided course reading.",
        action: () => {
          markLearningPathOpened(enrolledCourseId);
          navigate("/student/learning-path");
        },
        category: "START THIS WEEK",
        visualCategory: "reading",
        badgeLabel: "Reading",
        badgeTone: "neutral",
        metadata: deriveReadTime(readingResource),
        buttonLabel: "Open reading",
        buttonVariant: "outline",
      });
    }

    // Rule 6 — Practice Exam (only once all visible weeks reached AND all published quizzes taken)
    const allVisibleWeeksReached =
      lessonPlan.length > 0 &&
      lessonPlan.every((wk: any) => Number(wk.day) <= currentWeek);
    const allQuizzesTaken =
      availableQuizDays.size > 0 &&
      Array.from(availableQuizDays).every((w) => !!takenQuizzes[w]);
    if (allVisibleWeeksReached && allQuizzesTaken && taSettings?.examEnabled !== false) {
      nextActions.push({
        icon: ClipboardCheck,
        title: "Practice exam",
        description: "You've reached the end of the course — try a timed simulation",
        action: () => attemptExamMode(),
        category: "PRACTICE",
        visualCategory: "practice",
        badgeLabel: "Practice exam",
        badgeTone: "neutral",
        metadata: "Timed simulation",
        buttonLabel: "Start exam",
        buttonVariant: "outline",
      });
    }

    // Safe default — never show an empty list
    if (nextActions.length === 0) {
      nextActions.push({
        icon: MessageSquare,
        title: "Open the Study Chat",
        description: "Ask a question or explore a concept",
        action: () => navigate("/student/chat?newchat=true"),
        category: "EXPLORE",
        visualCategory: "continue",
        badgeLabel: "Continue learning",
        badgeTone: "green",
        metadata: "Based on your last session",
        buttonLabel: "Review with TA",
        buttonVariant: "outline",
      });
    }
  }



  const parseList = (text: string) =>
    text.split("\n").map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {displayName}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{courseName}</p>
      </motion.div>


      {/* Course Progress */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Course Progress</p>
              </div>
              <span className="text-sm text-muted-foreground">Unit {displayedUnit} of {totalWeeks}</span>
            </div>
            <Progress value={progressPct} className="h-2 mb-1" />
            <p className="text-xs text-muted-foreground">
              {publishedQuizCount === 0
                ? "No quizzes published yet"
                : `${passedQuizCount} of ${publishedQuizCount} weekly quizzes passed (>50%)`}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* What to do next */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mb-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <CardTitle className="flex items-center gap-3 text-base">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Compass className="h-4 w-4" />
                  </span>
                  What to do today
                </CardTitle>
                <CardDescription className="mt-1">
                  Three focused activities based on your course schedule and recent mastery.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/student/learning-path")}
                className="shrink-0"
              >
                View full learning path
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary">Preview</Badge>
              <Badge variant="outline">
                {nextActionsLoading ? "— activities" : `${Math.min(nextActions.length, 3)} activities`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextActionsLoading ? (
              <div className="flex w-full items-center gap-4 rounded-xl border p-4">
                <div className="h-11 w-11 rounded-xl bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-2 w-1/2 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ) : (
              nextActions.slice(0, 3).map((action, i) => {
                const isGreen = action.badgeTone === "green";
                const isMuted = action.visualCategory === "heads-up";
                const tileClass = isGreen
                  ? "bg-green-500/10 text-green-600 dark:text-green-500"
                  : isMuted
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary";
                const badgeClass = isGreen
                  ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-500/20 dark:text-green-400"
                  : "bg-muted text-muted-foreground hover:bg-muted";
                return (
                  <button
                    key={i}
                    onClick={action.action}
                    className="flex w-full items-center gap-4 rounded-xl border p-4 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${tileClass}`}>
                      <action.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={`text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}>
                          {action.badgeLabel}
                        </Badge>
                        {action.metadata && (
                          <span className="text-xs text-muted-foreground">{action.metadata}</span>
                        )}
                      </div>
                      <p className="text-[15px] font-semibold leading-snug mt-1">{action.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{action.description}</p>
                    </div>
                    <Button
                      variant={action.buttonVariant}
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        action.action();
                      }}
                    >
                      {action.buttonLabel}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Concept Mastery Heat Map */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mb-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4 text-primary shrink-0" /> Concept Mastery Map
                </CardTitle>
                <CardDescription>Your mastery per concept — grows as you work with the AI tutor, complete quizzes and exams. Separate from lesson completion.</CardDescription>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-primary">{courseMastery !== null ? `${Math.round(courseMastery * 100)}%` : "—"}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall Mastery</p>
              </div>
            </div>
            <div className="mt-3">
              <Progress value={courseMastery !== null ? Math.round(courseMastery * 100) : 0} className="h-2" />
            </div>
          </CardHeader>
          <CardContent>
            {concepts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Concepts will appear here once your professor sets them up.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {concepts.map((concept) => {
                  const m = conceptMastery[concept.id];
                  const attempted = m?.attempted ?? 0;
                  const score = m?.score ?? 0;
                  const level = getMasteryLevel(attempted, score);
                  const pct = attempted > 0 ? Math.floor(score * 100) : null;
                  return (
                    <Tooltip key={concept.id}>
                      <TooltipTrigger asChild>
                        <div className={`rounded-lg p-3 text-center cursor-default transition-colors ${MASTERY_TILE_CLASS[level]}`}>
                          <p className="text-xs font-medium truncate">{concept.name}</p>
                          <p className="text-sm font-semibold mt-1">{MASTERY_LABEL[level]}</p>
                          {pct !== null && (
                            <p className="text-[10px] opacity-80 mt-0.5">{pct}%</p>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {concept.name}: {MASTERY_LABEL[level]}
                          {pct !== null ? ` (${pct}% mastery)` : ""}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

            )}
            <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
              {(["not_explored", "beginner", "developing", "proficient", "expert"] as MasteryLevel[]).map((lvl) => (
                <div key={lvl} className="flex items-center gap-1.5">
                  <div className={`h-3 w-3 rounded ${MASTERY_SWATCH_CLASS[lvl]}`} />
                  <span className="text-[10px] text-muted-foreground">{MASTERY_LABEL[lvl]}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              The more you engage with the Teaching Assistant, the more accurate your exploration and mastery insights become
            </p>
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

export default StudentHome;
