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
import { workshopPlan as defaultPlan } from "@/data/workshopPlan";

/* ── Concept mastery data (mock — will be wired to real chat data later) ── */
const conceptMasteryData = [
  { name: "Variables & Types", status: "deeply_explored" as const, quizScore: 85 },
  { name: "Control Flow", status: "touched" as const, quizScore: null },
  { name: "Functions", status: "touched" as const, quizScore: 62 },
  { name: "Lists & Dicts", status: "not_explored" as const, quizScore: null },
  { name: "File Handling", status: "not_explored" as const, quizScore: null },
  { name: "OOP Basics", status: "not_explored" as const, quizScore: null },
  { name: "Error Handling", status: "not_explored" as const, quizScore: null },
  { name: "Modules", status: "touched" as const, quizScore: 55 },
];

type MasteryStatus = "deeply_explored" | "touched" | "not_explored";

const getMasteryColor = (status: MasteryStatus, quizScore: number | null) => {
  if (status === "not_explored") return "bg-background border text-muted-foreground";
  if (status === "deeply_explored" && quizScore !== null) {
    // Mastery quantified only for deeply explored topics
    if (quizScore >= 80) return "bg-primary text-primary-foreground";
    if (quizScore >= 60) return "bg-primary/60 text-foreground";
    if (quizScore >= 40) return "bg-primary/30 text-foreground";
    return "bg-destructive/20 text-destructive-foreground";
  }
  if (status === "deeply_explored") return "bg-primary/40 text-foreground";
  return "bg-primary/20 text-foreground";
};

const getMasteryLabel = (status: MasteryStatus, quizScore: number | null) => {
  if (status === "not_explored") return "Not explored";
  if (status === "deeply_explored" && quizScore !== null) return `${quizScore}% mastery`;
  if (status === "deeply_explored") return "Deeply explored";
  return "Touched";
};

const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const { profileData } = useStudentStatus();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const courseName = currentCourse?.name || "Intro to Python";
  const displayName = profileData?.name || studentProfile?.name || "Student";

  // Semester progress (mock)
  const totalWeeks = 16;
  const currentWeek = 6;
  const progressPct = Math.round((currentWeek / totalWeeks) * 100);

  // Lesson plan
  const [lessonPlan, setLessonPlan] = useState<any[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([currentWeek]);

  useEffect(() => {
    const loadPlan = async () => {
      if (!enrolledCourseId) { setPlanLoading(false); return; }
      try {
        const { data: course } = await supabase.from("courses").select("teacher_id").eq("id", enrolledCourseId).maybeSingle();
        if (!course?.teacher_id) { setPlanLoading(false); return; }
        const { data } = await supabase.storage.from("course-materials").download(`${course.teacher_id}/lesson-plan/published-plan.json?t=${Date.now()}`);
        if (data) {
          const parsed = JSON.parse(await data.text());
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLessonPlan(parsed.filter((d: any) => !d.locked));
            setPlanLoading(false);
            return;
          }
        }
      } catch {}
      setLessonPlan(defaultPlan.filter(d => !d.locked));
      setPlanLoading(false);
    };
    loadPlan();
  }, [enrolledCourseId]);

  const toggleWeek = (week: number) => {
    setExpandedWeeks(prev => prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]);
  };

  // Dynamic "What to do next" suggestions
  const unexplored = conceptMasteryData.filter(c => c.status === "not_explored");
  const weakConcepts = conceptMasteryData.filter(c => c.quizScore !== null && c.quizScore < 60);

  const nextActions = [];
  if (unexplored.length > 0) {
    nextActions.push({
      icon: MessageSquare,
      title: `Start learning: ${unexplored[0].name}`,
      description: "Use the Study Chat to explore this concept",
      action: () => navigate("/student/chat?newchat=true"),
      variant: "default" as const,
    });
  }
  if (weakConcepts.length > 0) {
    nextActions.push({
      icon: Brain,
      title: `Strengthen: ${weakConcepts[0].name}`,
      description: `You scored ${weakConcepts[0].quizScore}% — revisit with the Teaching Assistant`,
      action: () => navigate("/student/chat?newchat=true"),
      variant: "outline" as const,
    });
  }
  nextActions.push({
    icon: ClipboardCheck,
    title: "Practice Exam",
    description: "Test your knowledge with a timed exam simulation",
    action: () => navigate("/student/chat?mode=exam"),
    variant: "outline" as const,
  });

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
              <span className="text-sm text-muted-foreground">Week {currentWeek} of {totalWeeks}</span>
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
            {nextActions.slice(0, 3).map((action, i) => (
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
            ))}
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
            <CardDescription>Weekly course plan with learning outcomes and activities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {planLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading lesson plan...</p>
            ) : lessonPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No lesson plan published yet</p>
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
                        <Badge variant={dp.day === currentWeek ? "default" : "outline"} className="shrink-0 text-xs w-16 justify-center">
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
                                    {activities.map((r: any, i: number) => (
                                      <div key={r.id || i} className="flex items-start gap-3 rounded-lg bg-muted/20 p-2.5">
                                        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
                                          <BookOpen className="h-3 w-3" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium">{r.title}</p>
                                          <p className="text-xs text-muted-foreground">{r.action}</p>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] shrink-0">{r.type}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Weekly Quiz option */}
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-sm font-medium">Week {dp.day} Quiz</p>
                              <p className="text-xs text-muted-foreground">Optional — helps you track your understanding</p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/student/chat?mode=quiz&day=${dp.day}`)}>
                            Take Quiz
                          </Button>
                        </div>
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
            <CardDescription>Based on your interactions with the Teaching Assistant across study, exam, and diagnostic sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {conceptMasteryData.map((concept) => (
                <Tooltip key={concept.name}>
                  <TooltipTrigger asChild>
                    <div className={`rounded-lg p-3 text-center cursor-default transition-colors ${getMasteryColor(concept.status, concept.quizScore)}`}>
                      <p className="text-xs font-medium truncate">{concept.name}</p>
                      <p className="text-lg font-bold mt-1">
                        {concept.status === "not_explored" ? "—" : concept.quizScore !== null ? `${concept.quizScore}%` : "•"}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{concept.name}: {getMasteryLabel(concept.status, concept.quizScore)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
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
                <div className="h-3 w-3 rounded bg-primary/40" />
                <span className="text-[10px] text-muted-foreground">Deeply explored</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-[10px] text-muted-foreground">Mastery (deeply explored)</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              The more you engage with the Teaching Assistant, the more accurate your exploration and mastery insights become
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default StudentHome;
