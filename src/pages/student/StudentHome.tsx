import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useStudentStatus } from "@/hooks/useStudentStatus";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, BookOpen, ArrowRight, MessageSquare, ClipboardCheck, ChevronDown, ChevronUp, Lock, Check, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import WeeklyQuizDialog from "@/components/WeeklyQuizDialog";


/* Concepts are loaded from the DB for the student's enrolled course.
   Mastery is a uniform "Not explored" placeholder until real data is wired. */

type MasteryStatus = "deeply_explored" | "touched" | "not_explored";

const getMasteryColor = (status: MasteryStatus) => {
  if (status === "not_explored") return "bg-background border text-muted-foreground";
  if (status === "deeply_explored") return "bg-primary text-primary-foreground";
  return "bg-primary/20 text-foreground";
};

const getMasteryLabel = (status: MasteryStatus, quizScore: number | null) => {
  if (status === "not_explored") return "Not explored";
  if (status === "deeply_explored") return quizScore !== null ? `${quizScore}% mastery` : "Deeply explored";
  return "Touched";
};

const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const { profileData } = useStudentStatus();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courseNameDb, setCourseNameDb] = useState<string | null>(null);
  const courseName = courseNameDb || currentCourse?.name || "";
  const displayName = profileData?.name || studentProfile?.name || "Student";

  // Semester progress — compute from course start_date
  const [courseStartDate, setCourseStartDate] = useState<string | null>(null);
  const [totalWeeks, setTotalWeeks] = useState(16);
  const currentWeek = courseStartDate
    ? Math.max(1, Math.min(totalWeeks, Math.floor((Date.now() - new Date(courseStartDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1))
    : 1;
  const progressPct = Math.round((currentWeek / totalWeeks) * 100);
  const [lessonPlanPublished, setLessonPlanPublished] = useState(false);
  const [lessonPlanError, setLessonPlanError] = useState(false);

  // Lesson plan
  const [lessonPlan, setLessonPlan] = useState<any[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([currentWeek]);
  const [concepts, setConcepts] = useState<{ id: string; name: string }[]>([]);
  const [quizDialog, setQuizDialog] = useState<{ open: boolean; day: number | null }>({ open: false, day: null });
  const [conceptMastery, setConceptMastery] = useState<Record<string, { score: number; attempted: number }>>({});
  const [courseMastery, setCourseMastery] = useState<number | null>(null);
  const [takenQuizzes, setTakenQuizzes] = useState<Record<number, { score: number }>>({});
  const [availableQuizDays, setAvailableQuizDays] = useState<Set<number>>(new Set());

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
        .select("quiz_day, score")
        .eq("student_id", user.id)
        .eq("course_id", enrolledCourseId)
        .eq("mode", "daily_quiz");
      if (cancelled) return;
      if (error) { console.error("Taken quizzes load error:", error); setTakenQuizzes({}); return; }
      const map: Record<number, { score: number }> = {};
      (data || []).forEach((r: any) => {
        if (r.quiz_day != null) {
          const day = Number(r.quiz_day);
          const score = Number(r.score) || 0;
          // Keep the highest score in case any duplicates exist
          if (!map[day] || score > map[day].score) map[day] = { score };
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


  useEffect(() => {
    const loadPlan = async () => {
      if (!enrolledCourseId) { setPlanLoading(false); return; }
      let publishedAt: string | null = null;
      try {
        const { data: course } = await supabase
          .from("courses")
          .select("teacher_id, name, start_date, total_weeks, lesson_plan_published_at")
          .eq("id", enrolledCourseId)
          .maybeSingle();
        if (!course?.teacher_id) {
          // Course id is stale (deleted / not visible). Clear cache so the
          // useEnrolledCourseId hook can recover on next render.
          console.warn("[StudentHome] enrolledCourseId did not resolve to a visible course; clearing cache", enrolledCourseId);
          if (typeof window !== "undefined") localStorage.removeItem("enrolledCourseId");
          setPlanLoading(false);
          return;
        }
        if (course.name) setCourseNameDb(course.name);
        if (course.start_date) setCourseStartDate(course.start_date);
        if (course.total_weeks) setTotalWeeks(course.total_weeks);
        publishedAt = course.lesson_plan_published_at ?? null;

        // Read visible weeks directly from the database. RLS hides locked +
        // future weeks automatically — students literally cannot see them.
        const { data: rows, error: rowsError } = await supabase
          .from("lesson_plan_weeks")
          .select("week_number, week_name, overview, is_exam_week, concepts, resources")
          .eq("course_id", enrolledCourseId)
          .order("week_number");

        if (rowsError) {
          console.error("Lesson plan load error:", rowsError);
          setLessonPlanPublished(false);
          setLessonPlanError(Boolean(publishedAt));
          setLessonPlan([]);
          setPlanLoading(false);
          return;
        }

        if (!publishedAt && (!rows || rows.length === 0)) {
          // Professor has never published.
          setLessonPlanPublished(false);
          setLessonPlanError(false);
          setLessonPlan([]);
          setPlanLoading(false);
          return;
        }

        // Map DB rows to the shape the existing renderer expects.
        const mapped = (rows || []).map((r: any) => {
          const conceptList = Array.isArray(r.concepts) ? r.concepts : [];
          const conceptNames: string[] = conceptList
            .map((c: any) => c?.name)
            .filter((n: any) => typeof n === "string" && n.length > 0);
          const resources = (Array.isArray(r.resources) ? r.resources : []).map((res: any, i: number) => ({
            id: String(res?.id ?? `r_${r.week_number}_${i}`),
            type: String(res?.type ?? "resource"),
            title: String(res?.title ?? ""),
            description: res?.description ? String(res.description) : undefined,
            url: res?.url ? String(res.url) : undefined,
            concept: res?.concept ? String(res.concept) : (conceptNames[0] || "General"),
            action: res?.action ? String(res.action) : (res?.description ? String(res.description) : undefined),
          }));
          return {
            id: `w_${r.week_number}`,
            day: r.week_number,
            topic: r.week_name || `Week ${r.week_number}`,
            description: r.overview || "",
            is_exam_week: !!r.is_exam_week,
            locked: false, // RLS already filtered — anything we received is visible
            concepts: conceptList.map((c: any, i: number) => ({
              id: String(c?.id ?? `c_${r.week_number}_${i}`),
              name: String(c?.name ?? ""),
              brief_description: c?.brief_description ? String(c.brief_description) : undefined,
            })),
            resources,
          };
        });

        if (mapped.length > 0) {
          setLessonPlanPublished(true);
          setLessonPlanError(false);
          setLessonPlan(mapped);
          setPlanLoading(false);
          return;
        }

        // Published but no visible weeks yet (e.g. all locked + before start_date)
        setLessonPlanPublished(true);
        setLessonPlanError(false);
        setLessonPlan([]);
        setPlanLoading(false);
        return;
      } catch (err) {
        console.error("Lesson plan load error:", err);
        setLessonPlanError(Boolean(publishedAt));
      }
      setLessonPlanPublished(false);
      setLessonPlan([]);
      setPlanLoading(false);
    };
    loadPlan();
  }, [enrolledCourseId]);

  const toggleWeek = (week: number) => {
    setExpandedWeeks(prev => prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]);
  };

  // Dynamic "What to do next" — prioritised from real signals.
  const nextActionsLoading =
    planLoading || diagnosticTaken === null || (!!enrolledCourseId && concepts.length === 0 && lessonPlanPublished);

  type NextAction = { icon: any; title: string; description: string; action: () => void };
  const nextActions: NextAction[] = [];

  // Build a lookup of concept_code -> concept id for the current course
  const conceptIdByName = new Map<string, string>();
  concepts.forEach((c) => conceptIdByName.set(c.name, c.id));

  // Concept ids that appear in any visible lesson-plan week
  const visibleConceptIds = new Set<string>();
  // Current-week concept names (in order) from the lesson plan
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
  const isExamWeek = !!currentWeekRow?.is_exam_week;

  // Rule 1 — no lesson plan published
  if (!lessonPlanPublished) {
    nextActions.push({
      icon: BookOpen,
      title: "Lesson plan not published yet",
      description: "Your professor hasn't published the lesson plan. Check back soon.",
      action: () => { /* no-op */ },
    });
  } else {
    // Rule 2 — diagnostic not taken
    if (diagnosticTaken === false) {
      nextActions.push({
        icon: Brain,
        title: "Take the diagnostic quiz",
        description: "Helps the assistant calibrate to your level",
        action: () => navigate(`/student/diagnostic?course=${enrolledCourseId ?? ""}`),
      });
    }

    const currentWeekQuizAvailable = availableQuizDays.has(currentWeek) && !takenQuizzes[currentWeek];

    // Rule 3 (normal) — this week's untaken quiz; bumps down on exam weeks
    if (currentWeekQuizAvailable && !isExamWeek) {
      nextActions.push({
        icon: ClipboardCheck,
        title: `Take this week's quiz: ${currentWeekRow?.topic || `Week ${currentWeek}`}`,
        description: "Quick check-in on this week's concepts",
        action: () => setQuizDialog({ open: true, day: currentWeek }),
      });
    }

    // On exam weeks, surface Practice Exam earlier
    if (isExamWeek && taSettings?.examEnabled !== false) {
      nextActions.push({
        icon: ClipboardCheck,
        title: "Practice Exam",
        description: "Exam week — simulate a timed exam in chat",
        action: () => navigate("/student/chat?mode=exam"),
      });
    }

    // Rule 4 — weakest touched concept within visible scope
    const touchedVisible = Object.entries(conceptMastery)
      .filter(([id, m]) => visibleConceptIds.has(id) && m.attempted > 0)
      .sort(([, a], [, b]) => a.score - b.score);
    if (touchedVisible.length > 0) {
      const [weakestId] = touchedVisible[0];
      const weakest = concepts.find((c) => c.id === weakestId);
      if (weakest) {
        nextActions.push({
          icon: Sparkles,
          title: `Strengthen: ${weakest.name}`,
          description: "Revisit this concept in the Study Chat",
          action: () => navigate(`/student/chat?newchat=true&concept=${encodeURIComponent(weakest.name)}`),
        });
      }
    }

    // Rule 5 — first unexplored current-week concept
    const unexploredThisWeek = currentWeekConcepts.find(
      (c) => !c.id || !conceptMastery[c.id] || conceptMastery[c.id].attempted === 0,
    );
    if (unexploredThisWeek) {
      nextActions.push({
        icon: BookOpen,
        title: `Start this week: ${unexploredThisWeek.name}`,
        description: `Week ${currentWeek} — open a new chat to dig in`,
        action: () => navigate("/student/chat?newchat=true"),
      });
    }

    // Rule 6 — earliest missed earlier weekly quiz
    const visibleWeekNumbers = lessonPlan
      .map((wk: any) => Number(wk.day))
      .filter((d: number) => Number.isFinite(d) && d < currentWeek)
      .sort((a: number, b: number) => a - b);
    const missedEarlier = visibleWeekNumbers.find((w: number) => availableQuizDays.has(w) && !takenQuizzes[w]);
    if (missedEarlier != null) {
      nextActions.push({
        icon: ClipboardCheck,
        title: `Catch up on Week ${missedEarlier} quiz`,
        description: "You haven't taken this one yet",
        action: () => setQuizDialog({ open: true, day: missedEarlier }),
      });
    }

    // Rule 7 — practice exam (default fallback when exam enabled and not already pushed)
    if (!isExamWeek && taSettings?.examEnabled !== false) {
      nextActions.push({
        icon: ClipboardCheck,
        title: "Practice Exam",
        description: "Test your knowledge with a timed exam simulation",
        action: () => navigate("/student/chat?mode=exam"),
      });
    }

    // Rule 8 — everything done
    const allQuizzesTaken = Array.from(availableQuizDays).every((w) => !!takenQuizzes[w]);
    const allVisibleConceptsTouched =
      visibleConceptIds.size > 0 &&
      Array.from(visibleConceptIds).every((id) => (conceptMastery[id]?.attempted ?? 0) > 0);
    if (nextActions.length === 0 && allQuizzesTaken && allVisibleConceptsTouched) {
      nextActions.push({
        icon: Sparkles,
        title: "You're caught up — keep practising in chat",
        description: "Try a deeper question or revisit a concept",
        action: () => navigate("/student/chat?newchat=true"),
      });
    }

    // Always have at least one card to show as a safe default
    if (nextActions.length === 0) {
      nextActions.push({
        icon: MessageSquare,
        title: "Open the Study Chat",
        description: "Ask a question or explore a concept",
        action: () => navigate("/student/chat?newchat=true"),
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

      {/* Privacy notice */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="mb-5">
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Your data is private & anonymized.</span>{" "}
            Your professor can only see aggregate class trends — never your individual chats, quiz answers, or performance data.
          </p>
        </div>
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
              <span className="text-sm text-muted-foreground">Unit {currentWeek} of {totalWeeks}</span>
            </div>
            <Progress value={progressPct} className="h-2 mb-1" />
            <p className="text-xs text-muted-foreground">Semester in progress</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* What to do next */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> What to Do Next
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nextActionsLoading ? (
              <div className="flex w-full items-center gap-3 rounded-lg border p-3">
                <div className="h-8 w-8 rounded-lg bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-2 w-1/2 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ) : (
              nextActions.slice(0, 3).map((action, i) => (
                <button
                  key={i}
                  onClick={action.action}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Lesson Plan */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" /> Lesson Plan
            </CardTitle>
            <CardDescription>Unit-by-unit course plan with learning outcomes and activities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {planLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading lesson plan...</p>
            ) : !lessonPlanPublished ? (
              <div className="text-center py-6 space-y-1">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
                {lessonPlanError ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Lesson plan is being updated</p>
                    <p className="text-xs text-muted-foreground">Please refresh in a moment. If this keeps showing, let your professor know.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Lesson plan not yet available</p>
                    <p className="text-xs text-muted-foreground">Your professor hasn't published the lesson plan yet. You're currently on Unit {currentWeek} of {totalWeeks}.</p>
                  </>
                )}
              </div>
            ) : lessonPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No weeks are visible yet — check back soon</p>
            ) : (
              lessonPlan.map((dp: any) => {
                const isExpanded = expandedWeeks.includes(dp.day);
                const desc = dp.description || "";
                const outcomesMatch = desc.match(/Learning Outcomes:\s*([\s\S]*?)(?=Concepts:|Teaching Strategies:|$)/i);
                const outcomes = outcomesMatch?.[1]?.trim().replace(/\*\*/g, "") || "";

                return (
                  <div key={dp.id || dp.day} className={`rounded-lg border ${isExpanded ? "border-primary/20" : ""}`}>
                    <button
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleWeek(dp.day)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant={dp.day === currentWeek ? "default" : "outline"} className="shrink-0 text-xs w-[72px] justify-center whitespace-nowrap">
                          Week {dp.day}
                        </Badge>
                        <span className="text-sm font-medium truncate">{dp.topic}</span>
                        {dp.day === currentWeek && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {/* Learning Outcomes */}
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

                        {/* Concepts → Activities (hierarchical) */}
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
                                      const inner = (
                                        <>
                                          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
                                            <BookOpen className="h-3 w-3" />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-medium ${hasUrl ? "text-primary group-hover:underline" : ""}`}>{r.title}</p>
                                            <p className="text-xs text-muted-foreground">{r.action}</p>
                                          </div>
                                          <Badge variant="outline" className="text-[10px] shrink-0">{r.type}</Badge>
                                        </>
                                      );
                                      return hasUrl ? (
                                        <a
                                          key={r.id || i}
                                          href={r.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="group flex items-start gap-3 rounded-lg bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
                                        >
                                          {inner}
                                        </a>
                                      ) : (
                                        <div key={r.id || i} className="flex items-start gap-3 rounded-lg bg-muted/20 p-2.5">
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

                        {/* Weekly Quiz option — only shown when professor has published one */}
                        {(() => {
                          if (!availableQuizDays.has(dp.day)) {
                            return (
                              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-3 flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">Quiz not yet available for this week.</p>
                              </div>
                            );
                          }
                          const taken = takenQuizzes[dp.day];
                          return (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-sm font-medium">Week {dp.day} Quiz</p>
                                  <p className="text-xs text-muted-foreground">
                                    {taken
                                      ? `Completed — ${taken.score}%`
                                      : "Optional — one attempt only"}
                                  </p>
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
                                    setQuizDialog({ open: true, day: dp.day });
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

      {/* Concept Mastery Heat Map */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" /> Concept Exploration & Mastery Map
            </CardTitle>
            <CardDescription>Based on your interactions with the Teaching Assistant across diagnostic test, study mode, and practice exam sessions</CardDescription>
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
                  const status: MasteryStatus =
                    attempted === 0 ? "not_explored" : score >= 0.75 ? "deeply_explored" : "touched";
                  const pct = attempted > 0 ? Math.round(score * 100) : null;
                  return (
                    <Tooltip key={concept.id}>
                      <TooltipTrigger asChild>
                        <div className={`rounded-lg p-3 text-center cursor-default transition-colors ${getMasteryColor(status)}`}>
                          <p className="text-xs font-medium truncate">{concept.name}</p>
                          <p className="text-lg font-bold mt-1">{pct !== null ? `${pct}%` : "—"}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{concept.name}: {getMasteryLabel(status, pct)}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

            )}
            <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-background border" />
                <span className="text-[10px] text-muted-foreground">Not explored</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary/20" />
                <span className="text-[10px] text-muted-foreground">Touched</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-[10px] text-muted-foreground">Deeply explored (% mastery shown)</span>
              </div>
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
    </div>
  );
};

export default StudentHome;
