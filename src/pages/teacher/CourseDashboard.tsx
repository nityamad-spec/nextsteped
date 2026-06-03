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

/* ── Static mock stats per concept (deterministic by id) ── */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function mockStatsFor(id: string) {
  const h = hashStr(id);
  const touched = 5 + (h % 31); // 5..35
  const deeplyExplored = 1 + ((h >> 3) % 25); // 1..25
  const notExplored = 5 + ((h >> 6) % 46); // 5..50
  const masteryPct = 30 + ((h >> 9) % 61); // 30..90
  return { touched, deeplyExplored, notExplored, masteryPct };
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
      const [conceptsRes, weeksRes] = await Promise.all([
        supabase
          .from("concepts")
          .select("id, concept_code, weight")
          .eq("course_id", courseId),
        supabase
          .from("lesson_plan_weeks")
          .select("week_number, concepts")
          .eq("course_id", courseId)
          .order("week_number", { ascending: true }),
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
    .map((c) => ({ concept: c.concept_code, ...mockStatsFor(c.id) }));

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

  // Semester progress (mock)
  const totalWeeks = 16;
  const currentWeek = 6;
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
            <span className="text-sm text-muted-foreground">Week {currentWeek} of {totalWeeks}</span>
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
            <CardDescription>Aggregate mastery across enrolled students</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <div className="h-2 w-full rounded-full bg-gradient-to-r from-mastery-beginner via-mastery-progressing via-mastery-proficient to-mastery-expert" />
              <div className="mt-2 grid grid-cols-4 text-[11px] font-medium text-muted-foreground">
                <span className="text-left">Beginner</span>
                <span className="text-center">Developing</span>
                <span className="text-center">Proficient</span>
                <span className="text-right">Expert</span>
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
              const pct = Math.max(0, Math.min(100, c.masteryPct));
              const level =
                pct < 25 ? "Beginner" :
                pct < 50 ? "Developing" :
                pct < 75 ? "Proficient" : "Expert";
              return (
                <div key={c.concept} className="space-y-1.5 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{c.concept}</span>
                    <span className="text-xs text-muted-foreground">{level}</span>
                  </div>
                  <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-mastery-beginner via-mastery-progressing via-mastery-proficient to-mastery-expert">
                    <div
                      className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-sm bg-foreground shadow-sm"
                      style={{ left: `calc(${pct}% - 1px)` }}
                    />
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
