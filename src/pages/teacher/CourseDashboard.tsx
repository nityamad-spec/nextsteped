import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useTASettings } from "@/hooks/useTASettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MessageSquare, Shield, BarChart3, Lightbulb, Handshake, RefreshCw, AlertTriangle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import CourseCollaborators from "@/components/CourseCollaborators";
import CourseStatusBanner from "@/components/CourseStatusBanner";

/* ── Mastery band thresholds (mirror update-mastery / DB CHECK constraint) ── */
function bandFor(score: number): "beginner" | "developing" | "proficient" | "expert" {
  if (score < 0.25) return "beginner";
  if (score < 0.50) return "developing";
  if (score < 0.75) return "proficient";
  return "expert";
}

type TeachingInsight = {
  text: string;
  concepts: string[];
  type: "weak_spot" | "strength" | "split_class" | "overall_trend";
  basis: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const CourseDashboard = () => {
  const { currentCourse } = useApp();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const { taSettings } = useTASettings(courseId);
  const courseSections = currentCourse?.sections || [];
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [hoveredConcept, setHoveredConcept] = useState<string | null>(null);
  
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [concepts, setConcepts] = useState<{ id: string; concept_code: string; weight: number }[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(true);
  const [conceptsError, setConceptsError] = useState<string | null>(null);

  const [lessonOrder, setLessonOrder] = useState<Map<string, number>>(new Map());
  const [masteryDist, setMasteryDist] = useState<Map<string, { beginner: number; developing: number; proficient: number; expert: number }>>(new Map());
  const [courseDist, setCourseDist] = useState<{ beginner: number; developing: number; proficient: number; expert: number; total: number }>({ beginner: 0, developing: 0, proficient: 0, expert: 0, total: 0 });
  const [stats, setStats] = useState<{ activeStudents: number; totalSessions: number } | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const fetchStats = async () => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)("course_dashboard_stats", { _course_id: courseId });
      if (cancelled) return;
      if (error) {
        console.error("course_dashboard_stats error", error);
        return;
      }
      const row = Array.isArray(data) ? (data[0] as { active_students: number; total_sessions: number } | undefined) : (data as { active_students: number; total_sessions: number } | null);
      if (row) {
        setStats({
          activeStudents: Number(row.active_students) || 0,
          totalSessions: Number(row.total_sessions) || 0,
        });
      }
    };
    fetchStats();

    const channel = supabase
      .channel(`course-sessions-${courseId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_sessions", filter: `course_id=eq.${courseId}` },
        () => { fetchStats(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  useEffect(() => {
    if (!courseId) { setConcepts([]); setLessonOrder(new Map()); setConceptsLoading(false); return; }
    let cancelled = false;
    setConceptsLoading(true);
    setConceptsError(null);
    (async () => {
      const [conceptsRes, weeksRes, masteryRes, courseMasteryRes] = await Promise.all([
        supabase
          .from("concepts")
          .select("id, concept_code, weight")
          .eq("course_id", courseId),
        supabase
          .from("lesson_plan_weeks")
          .select("week_number, concepts")
          .eq("course_id", courseId)
          .order("week_number", { ascending: true }),
        supabase
          .from("student_concept_mastery")
          .select("concept_id, mastery_score")
          .eq("course_id", courseId),
        supabase
          .from("student_course_mastery")
          .select("mastery_score")
          .eq("course_id", courseId),
      ]);
      if (cancelled) return;

      if (conceptsRes.error) {
        setConceptsError(conceptsRes.error.message);
        setConcepts([]);
      } else {
        setConcepts(conceptsRes.data || []);
      }

      const order = new Map<string, number>();
      if (!weeksRes.error && Array.isArray(weeksRes.data)) {
        let idx = 0;
        for (const w of weeksRes.data) {
          const list = Array.isArray((w as any).concepts) ? (w as any).concepts : [];
          for (const c of list) {
            const name = typeof c?.name === "string" ? c.name.trim().toLowerCase() : "";
            if (name && !order.has(name)) order.set(name, idx++);
          }
        }
      }
      setLessonOrder(order);

      const dist = new Map<string, { beginner: number; developing: number; proficient: number; expert: number }>();
      if (!masteryRes.error && Array.isArray(masteryRes.data)) {
        for (const row of masteryRes.data as Array<{ concept_id: string; mastery_score: number }>) {
          const cur = dist.get(row.concept_id) ?? { beginner: 0, developing: 0, proficient: 0, expert: 0 };
          cur[bandFor(Number(row.mastery_score))]++;
          dist.set(row.concept_id, cur);
        }
      }
      setMasteryDist(dist);

      const cDist = { beginner: 0, developing: 0, proficient: 0, expert: 0, total: 0 };
      if (!courseMasteryRes.error && Array.isArray(courseMasteryRes.data)) {
        for (const row of courseMasteryRes.data as Array<{ mastery_score: number }>) {
          cDist[bandFor(Number(row.mastery_score))]++;
          cDist.total++;
        }
      }
      setCourseDist(cDist);

      setConceptsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  const conceptRows = [...concepts]
    .sort((a, b) => {
      const ai = lessonOrder.get(a.concept_code.trim().toLowerCase());
      const bi = lessonOrder.get(b.concept_code.trim().toLowerCase());
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.concept_code.localeCompare(b.concept_code);
    })
    .map((c) => {
      const d = masteryDist.get(c.id) ?? { beginner: 0, developing: 0, proficient: 0, expert: 0 };
      return { id: c.id, concept: c.concept_code, ...d };
    });

  // Only need to know if the signed-in teacher is a collaborator (not the owner)
  // — owners get no banner, collaborators get the Handshake badge.
  useEffect(() => {
    if (!user || !courseId) { setIsCollaborator(false); return; }
    let cancelled = false;
    (async () => {
      const { data: course } = await supabase
        .from("courses")
        .select("teacher_id")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      if (course?.teacher_id === user.id) { setIsCollaborator(false); return; }
      const { data: membership } = await supabase
        .from("course_teachers")
        .select("role")
        .eq("course_id", courseId)
        .eq("teacher_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsCollaborator(!!membership && membership.role !== "owner");
    })();
    return () => { cancelled = true; };
  }, [user, courseId]);

  // Semester progress — date-based, mirrors /student/home
  const [courseSchedule, setCourseSchedule] = useState<{ start_date: string | null; total_weeks: number | null }>({ start_date: null, total_weeks: null });
  useEffect(() => {
    if (!courseId) { setCourseSchedule({ start_date: null, total_weeks: null }); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("start_date, total_weeks")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      setCourseSchedule({
        start_date: (data?.start_date as string | null) ?? null,
        total_weeks: (data?.total_weeks as number | null) ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  // Teaching Insights — cached AI-generated bullets
  const [insights, setInsights] = useState<TeachingInsight[]>([]);
  const [insightsGeneratedAt, setInsightsGeneratedAt] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsRefreshing, setInsightsRefreshing] = useState(false);
  const [insightsEmpty, setInsightsEmpty] = useState(false);
  const [insightsNeverGenerated, setInsightsNeverGenerated] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // Mount: only read the cached row. Never invoke the edge function.
  const loadCachedInsights = async () => {
    if (!courseId) return;
    setInsightsError(null);
    try {
      // Short-circuit when there's no mastery data at all
      const { count } = await supabase
        .from("student_concept_mastery")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId);
      if ((count ?? 0) === 0) {
        setInsights([]); setInsightsGeneratedAt(null); setInsightsEmpty(true); setInsightsNeverGenerated(false); return;
      }
      setInsightsEmpty(false);

      const { data: cached } = await supabase
        .from("course_teaching_insights")
        .select("insights, generated_at")
        .eq("course_id", courseId)
        .maybeSingle();

      if (cached && cached.generated_at) {
        setInsights((cached.insights as TeachingInsight[]) || []);
        setInsightsGeneratedAt(cached.generated_at as string);
        setInsightsNeverGenerated(false);
      } else {
        setInsights([]);
        setInsightsGeneratedAt(null);
        setInsightsNeverGenerated(true);
      }
    } catch (e: any) {
      setInsightsError(e?.message || "Failed to load insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  // Refresh button: invokes the edge function with force_refresh.
  const refreshInsights = async () => {
    if (!courseId) return;
    setInsightsRefreshing(true);
    setInsightsError(null);
    try {
      const { count } = await supabase
        .from("student_concept_mastery")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId);
      if ((count ?? 0) === 0) {
        setInsights([]); setInsightsGeneratedAt(null); setInsightsEmpty(true); setInsightsNeverGenerated(false); return;
      }
      setInsightsEmpty(false);

      const { data, error } = await supabase.functions.invoke("generate-teaching-insights", {
        body: { course_id: courseId, force_refresh: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setInsights(((data as any)?.insights as TeachingInsight[]) || []);
      setInsightsGeneratedAt(((data as any)?.generated_at as string | null) ?? null);
      setInsightsEmpty(!!(data as any)?.empty);
      setInsightsNeverGenerated(false);
    } catch (e: any) {
      const msg = e?.message || "Failed to refresh insights";
      setInsightsError(msg);
      toast({ title: "Couldn't refresh insights", description: msg, variant: "destructive" });
    } finally {
      setInsightsRefreshing(false);
    }
  };

  useEffect(() => {
    setInsightsLoading(true);
    setInsights([]);
    setInsightsGeneratedAt(null);
    setInsightsEmpty(false);
    setInsightsNeverGenerated(false);
    if (!courseId) { setInsightsLoading(false); return; }
    loadCachedInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);


  const totalWeeks = courseSchedule.total_weeks ?? 16;
  const hasStartDate = !!courseSchedule.start_date;
  const currentWeek = hasStartDate
    ? Math.max(1, Math.min(totalWeeks,
        Math.floor((Date.now() - new Date(courseSchedule.start_date!).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1))
    : 1;
  const progressPct = Math.round((currentWeek / totalWeeks) * 100);


  return (
    <div className="p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Course Dashboard</h1>
            <p className="text-muted-foreground">{currentCourse?.name || "Course"} — Student Insights</p>
          </div>
          {courseSections.length >= 1 && (
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Sections" /></SelectTrigger>
              <SelectContent>
                {courseSections.length > 1 && <SelectItem value="all">All Sections</SelectItem>}
                {courseSections.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">All student data is anonymized to protect privacy and encourage authentic engagement with the Teaching Assistant.</p>
        </div>
      </div>

      {/* Course publish & enrollment status */}
      <CourseStatusBanner />

      {/* Collaborator Banner — only shown for collaborators */}
      {isCollaborator && (
        <div className="mb-6 rounded-lg border-2 border-accent/40 bg-accent/5 px-5 py-4">
          <div className="flex items-start gap-3">
            <Handshake className="h-5 w-5 text-accent mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">
                  You are a Collaborator on this course
                </p>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  collaborator
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                You can view and edit every stage of the course pipeline alongside the owner, including publishing the course and managing enrollment. Only the owner can manage collaborators.
              </p>
              <div className="mt-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                  Sections you can edit
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Course Setup",
                    "Course Materials",
                    "Concepts",
                    "Lesson Plan",
                    "Diagnostic Questions",
                    "Exam Mode",
                    "AI TA Settings",
                    "Content Library",
                  ].map((s) => (
                    <Badge key={s} variant="outline" className="text-[11px] font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Course Progress */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Course Progress</p>
            <span className="text-sm text-muted-foreground">
              {hasStartDate ? `Week ${currentWeek} of ${totalWeeks}` : "Start date not set"}
            </span>
          </div>
          <Progress value={progressPct} className="h-3" />
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats ? stats.activeStudents : "—"}</p>
              <p className="text-xs text-muted-foreground">Active Students</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Active in the last 14 days</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats ? stats.totalSessions : "—"}</p>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Concept Mastery Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Concept Mastery Map</CardTitle>
            <CardDescription>Aggregate anonymous view — student mastery distribution per concept</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground">Course-level student distribution</span>
                <span className="text-xs text-muted-foreground">Total students: {courseDist.total}</span>
              </div>
              {courseDist.total === 0 ? (
                <p className="text-xs text-muted-foreground">No student mastery data yet</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    { key: "beginner", label: "Beginner", color: "bg-mastery-beginner" },
                    { key: "developing", label: "Developing", color: "bg-mastery-progressing" },
                    { key: "proficient", label: "Proficient", color: "bg-mastery-proficient" },
                    { key: "expert", label: "Expert", color: "bg-mastery-expert" },
                  ] as const).map((b) => (
                    <div key={b.key} className="rounded-md border bg-background px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={`h-2.5 w-2.5 rounded-sm ${b.color}`} />
                        <span className="text-xs text-muted-foreground">{b.label}</span>
                      </div>
                      <p className="text-xl font-semibold text-foreground">{courseDist[b.key]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">Legend:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-mastery-beginner" />
                <span className="text-xs text-muted-foreground">Beginner</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-mastery-progressing" />
                <span className="text-xs text-muted-foreground">Developing</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-mastery-proficient" />
                <span className="text-xs text-muted-foreground">Proficient</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-mastery-expert" />
                <span className="text-xs text-muted-foreground">Expert</span>
              </div>
            </div>

            {conceptsLoading ? (
              <div className="space-y-3">
                {[0,1,2,3].map((i) => (
                  <div key={i} className="space-y-1.5 px-3 py-2">
                    <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-full rounded-full bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : conceptsError ? (
              <p className="text-sm text-destructive px-3 py-2">Failed to load concepts: {conceptsError}</p>
            ) : conceptRows.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-4 text-center">
                No concepts defined for this course yet. Add them in Concept Review.
              </p>
            ) : conceptRows.map((c) => {
              const { beginner, developing, proficient, expert } = c;
              const total = beginner + developing + proficient + expert;
              const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
              return (
                <div key={c.id} className="space-y-1.5 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">{c.concept}</span>
                    {total === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No student data yet</span>
                    ) : (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground font-medium">{beginner} Beginner</span>
                        <span className="text-muted-foreground font-medium">{developing} Developing</span>
                        <span className="text-muted-foreground font-medium">{proficient} Proficient</span>
                        <span className="text-muted-foreground font-medium">{expert} Expert</span>
                      </div>
                    )}
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    {total > 0 && (
                      <>
                        <div className="bg-mastery-beginner" style={{ width: `${pct(beginner)}%` }} />
                        <div className="bg-mastery-progressing" style={{ width: `${pct(developing)}%` }} />
                        <div className="bg-mastery-proficient" style={{ width: `${pct(proficient)}%` }} />
                        <div className="bg-mastery-expert" style={{ width: `${pct(expert)}%` }} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Teaching Insights */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> Teaching Insights</CardTitle>
                <CardDescription>AI-generated suggestions grounded in your students' real mastery data</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {insightsGeneratedAt && (
                  <span className="text-xs text-muted-foreground">Updated {timeAgo(insightsGeneratedAt)}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refreshInsights}
                  disabled={insightsRefreshing || insightsLoading || insightsEmpty}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${insightsRefreshing ? "animate-spin" : ""}`} />
                  <span className="ml-1.5">Refresh</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {insightsLoading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))
            ) : insightsEmpty ? (
              <p className="text-sm text-muted-foreground px-4 py-6 text-center">
                Insights will appear here once students start completing weekly quizzes, exams, or practice questions.
              </p>
            ) : insightsError && insights.length === 0 ? (
              <p className="text-sm text-destructive px-4 py-3">{insightsError}</p>
            ) : insightsNeverGenerated ? (
              <p className="text-sm text-muted-foreground px-4 py-6 text-center">
                No insights generated yet. Click Refresh to generate.
              </p>
            ) : insights.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-6 text-center">No insights yet.</p>
            ) : (
              insights.map((ins, i) => {
                const Icon =
                  ins.type === "weak_spot" ? AlertCircle
                  : ins.type === "split_class" ? AlertTriangle
                  : ins.type === "strength" ? Lightbulb
                  : Lightbulb;
                const tone =
                  ins.type === "weak_spot"
                    ? "border-destructive/30 bg-destructive/5"
                    : ins.type === "split_class"
                      ? "border-mastery-progressing/40 bg-mastery-progressing/10"
                      : ins.type === "strength"
                        ? "border-mastery-expert/40 bg-mastery-expert/10"
                        : "border-primary/20 bg-primary/5";
                const iconColor =
                  ins.type === "weak_spot" ? "text-destructive"
                  : ins.type === "split_class" ? "text-mastery-progressing"
                  : ins.type === "strength" ? "text-mastery-expert"
                  : "text-primary";
                const label =
                  ins.type === "weak_spot" ? "Weak spot"
                  : ins.type === "split_class" ? "Split class"
                  : ins.type === "strength" ? "Strength"
                  : "Overall trend";
                return (
                  <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${tone}`}>
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColor}`} />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{ins.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{label}</Badge>
                        {(ins.concepts ?? []).map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px] font-normal">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>


        {/* Collaborators */}
        <CourseCollaborators />
      </div>
    </div>
  );
};

export default CourseDashboard;
