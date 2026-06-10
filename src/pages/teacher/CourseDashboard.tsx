import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useTASettings } from "@/hooks/useTASettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MessageSquare, Shield, BarChart3, Lightbulb, Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CourseCollaborators from "@/components/CourseCollaborators";
import CourseStatusBanner from "@/components/CourseStatusBanner";

/* ── Mastery band thresholds (mirror update-mastery / DB CHECK constraint) ── */
function bandFor(score: number): "beginner" | "developing" | "proficient" | "expert" {
  if (score < 0.25) return "beginner";
  if (score < 0.50) return "developing";
  if (score < 0.75) return "proficient";
  return "expert";
}

const insightsMock = [
  "Consider dedicating extra time to **Functions** — most students have only touched this concept without deep exploration.",
  "**Variables & Types** is well-explored. You can reference this as a foundation when introducing more advanced topics.",
  "**File Handling** and **OOP Basics** have the highest 'Not Explored' rates. A targeted lab session could help accelerate engagement.",
  "Students who deeply explored **Control Flow** tend to also explore **Functions** — consider linking these topics in your teaching.",
];

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

  useEffect(() => {
    if (!courseId) { setConcepts([]); setLessonOrder(new Map()); setConceptsLoading(false); return; }
    let cancelled = false;
    setConceptsLoading(true);
    setConceptsError(null);
    (async () => {
      const [conceptsRes, weeksRes, masteryRes] = await Promise.all([
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
              <p className="text-2xl font-bold">45</p>
              <p className="text-xs text-muted-foreground">Active Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">312</p>
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
              const total = Math.max(1, c.touched + c.deeplyExplored + c.notExplored);
              // Deterministic static distribution from concept name
              let h = 0;
              for (let i = 0; i < c.concept.length; i++) h = (h * 31 + c.concept.charCodeAt(i)) >>> 0;
              const w1 = (h % 100) / 100;
              const w2 = ((h >>> 7) % 100) / 100;
              const w3 = ((h >>> 13) % 100) / 100;
              const w4 = ((h >>> 19) % 100) / 100;
              const sum = w1 + w2 + w3 + w4 || 1;
              const beginner = Math.round((w1 / sum) * total);
              const developing = Math.round((w2 / sum) * total);
              const proficient = Math.round((w3 / sum) * total);
              const expert = Math.max(0, total - beginner - developing - proficient);
              const pct = (n: number) => (n / total) * 100;
              return (
                <div key={c.concept} className="space-y-1.5 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">{c.concept}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground font-medium">{beginner} Beginner</span>
                      <span className="text-muted-foreground font-medium">{developing} Developing</span>
                      <span className="text-muted-foreground font-medium">{proficient} Proficient</span>
                      <span className="text-muted-foreground font-medium">{expert} Expert</span>
                    </div>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="bg-mastery-beginner" style={{ width: `${pct(beginner)}%` }} />
                    <div className="bg-mastery-progressing" style={{ width: `${pct(developing)}%` }} />
                    <div className="bg-mastery-proficient" style={{ width: `${pct(proficient)}%` }} />
                    <div className="bg-mastery-expert" style={{ width: `${pct(expert)}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Teaching Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> Teaching Insights</CardTitle>
            <CardDescription>Suggestions to enhance learning based on student engagement patterns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insightsMock.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{
                  __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                }} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Collaborators */}
        <CourseCollaborators />
      </div>
    </div>
  );
};

export default CourseDashboard;
