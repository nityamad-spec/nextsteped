import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useTASettings } from "@/hooks/useTASettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MessageSquare, Shield, BarChart3, Lightbulb, AlertTriangle, BookOpen, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import CourseCollaborators from "@/components/CourseCollaborators";

/* ── Concept Exploration Map categories ── */
const conceptMasteryMock = [
  { concept: "Variables & Types", touched: 32, deeplyExplored: 18, notExplored: 5, masteryPct: 72 },
  { concept: "Control Flow", touched: 28, deeplyExplored: 22, notExplored: 5, masteryPct: 64 },
  { concept: "Functions", touched: 20, deeplyExplored: 10, notExplored: 25, masteryPct: 45 },
  { concept: "Lists & Dicts", touched: 15, deeplyExplored: 5, notExplored: 35, masteryPct: 38 },
  { concept: "File Handling", touched: 8, deeplyExplored: 2, notExplored: 45, masteryPct: 50 },
  { concept: "OOP Basics", touched: 5, deeplyExplored: 1, notExplored: 49, masteryPct: 100 },
  { concept: "Error Handling", touched: 12, deeplyExplored: 4, notExplored: 39, masteryPct: 57 },
  { concept: "Modules", touched: 10, deeplyExplored: 3, notExplored: 42, masteryPct: 67 },
];

const insightsMock = [
  "Consider dedicating extra time to **Functions** — most students have only touched this concept without deep exploration.",
  "**Variables & Types** is well-explored. You can reference this as a foundation when introducing more advanced topics.",
  "**File Handling** and **OOP Basics** have the highest 'Not Explored' rates. A targeted lab session could help accelerate engagement.",
  "Students who deeply explored **Control Flow** tend to also explore **Functions** — consider linking these topics in your teaching.",
];

const CourseDashboard = () => {
  const { currentCourse } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const courseId = useTeacherCourseId();
  const { taSettings } = useTASettings(courseId);
  const courseSections = currentCourse?.sections || [];
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [lessonPlanPublished, setLessonPlanPublished] = useState<boolean | null>(null);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [coursePublished, setCoursePublished] = useState<boolean | null>(null);
  const [hoveredConcept, setHoveredConcept] = useState<string | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);

  // Semester progress (mock)
  const totalWeeks = 16;
  const currentWeek = 6;
  const progressPct = Math.round((currentWeek / totalWeeks) * 100);

  useEffect(() => {
    if (!user) return;
    const checkPlan = async () => {
      const { data } = await supabase.storage
        .from("course-materials")
        .download(`${user.id}/lesson-plan/published-plan.json?t=${Date.now()}`);
      setLessonPlanPublished(!!data);
    };
    checkPlan();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const checkSetup = async () => {
      try {
        const { data: syllabusFiles } = await supabase
          .from("course_material_files")
          .select("id")
          .eq("teacher_id", user.id)
          .eq("folder_type", "syllabus")
          .limit(1);
        if (!syllabusFiles || syllabusFiles.length === 0) { setSetupComplete(false); return; }

        const { data: published } = await supabase.storage
          .from("course-materials")
          .download(`${user.id}/lesson-plan/published-plan.json`);
        if (!published) { setSetupComplete(false); return; }

        if (!courseId) { setSetupComplete(false); return; }

        const { data: dq } = await supabase
          .from("diagnostic_questions")
          .select("id")
          .eq("course_id", courseId)
          .limit(1);
        if (!dq || dq.length === 0) { setSetupComplete(false); return; }

        const { data: ta } = await supabase
          .from("course_ta_settings")
          .select("custom_study_prompt, exam_enabled, exam_approved")
          .eq("course_id", courseId)
          .maybeSingle();
        const aiDone = !!(ta?.custom_study_prompt && ta.custom_study_prompt.trim().length > 0);
        const examDone = !!(ta?.exam_enabled || ta?.exam_approved);
        setSetupComplete(aiDone && examDone);
      } catch {
        setSetupComplete(false);
      }
    };
    checkSetup();
  }, [user, courseId]);

  useEffect(() => {
    if (!courseId) { setCoursePublished(null); return; }
    const checkPublished = async () => {
      const { data } = await supabase
        .from("courses")
        .select("published")
        .eq("id", courseId)
        .maybeSingle();
      setCoursePublished(!!data?.published);
    };
    checkPublished();
  }, [courseId]);


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

      {/* Setup Incomplete Banner */}
      {setupComplete === false && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border-2 border-primary/30 bg-primary/10 px-5 py-4">
          <ListChecks className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Finish setting up your course</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your course setup isn't complete yet. Finish all five setup modules so your students get the full experience — lesson plan, AI assistant, diagnostic, and exam mode all configured.
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-3 gap-2"
              onClick={() => navigate("/teacher/setup")}
            >
              <ListChecks className="h-4 w-4" />
              Go to Course Setup
            </Button>
          </div>
        </div>
      )}

      {/* Course Not Published Banner */}
      {setupComplete === true && coursePublished === false && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border-2 border-primary/30 bg-primary/10 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Publish your course so students can enroll</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your setup is complete — the last step is publishing the course so students can join with your enrollment code.
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-3 gap-2"
              onClick={() => navigate("/teacher/setup")}
            >
              <ListChecks className="h-4 w-4" />
              Go to Course Setup
            </Button>
          </div>
        </div>
      )}

      {/* Lesson Plan Not Published Banner */}
      {lessonPlanPublished === false && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border-2 border-amber-500/30 bg-amber-500/10 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Your lesson plan hasn't been published to students yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Students won't see the lesson plan until you publish it. You can keep making edits at any time, and control which weeks are visible to students — perfect for revealing content week by week as you finalize each section. Publish when you're ready from <strong>Lesson Plan & Resources</strong>.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={() => navigate("/teacher/courses/content")}
            >
              <BookOpen className="h-4 w-4" />
              Go to Lesson Plan & Resources
            </Button>
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
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Concept Exploration Map</CardTitle>
            <CardDescription>Aggregate anonymous view — based on chat interactions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">Legend:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-xs text-muted-foreground">Deeply Explored</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary/40" />
                <span className="text-xs text-muted-foreground">Touched</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-muted" />
                <span className="text-xs text-muted-foreground">Not Explored</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                <span className="text-[10px] text-muted-foreground">Mastery level — click a row for details</span>
              </div>
            </div>

            {conceptMasteryMock.map((c) => {
              const total = c.touched + c.deeplyExplored + c.notExplored;
              const touchedPct = Math.round((c.touched / total) * 100);
              const deepPct = Math.round((c.deeplyExplored / total) * 100);
              const isExpanded = expandedConcept === c.concept;
              const dotColor = c.deeplyExplored === 0
                ? "bg-muted-foreground/30"
                : c.masteryPct >= 70
                  ? "bg-emerald-500"
                  : c.masteryPct >= 50
                    ? "bg-amber-500"
                    : "bg-destructive";
              return (
                <div
                  key={c.concept}
                  className="space-y-1.5 rounded-lg px-3 py-2 cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => setExpandedConcept(isExpanded ? null : c.concept)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${dotColor} shrink-0`} />
                      <span className="text-sm font-medium">{c.concept}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{c.deeplyExplored} deep</span>
                      <span>{c.touched} touched</span>
                      <span>{c.notExplored} unexplored</span>
                    </div>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="bg-primary transition-all" style={{ width: `${deepPct}%` }} />
                    <div className="bg-primary/40 transition-all" style={{ width: `${touchedPct}%` }} />
                  </div>
                  {isExpanded && c.deeplyExplored > 0 && (
                    <div className="flex items-center gap-2 ml-5 pt-1 animate-in slide-in-from-top-1 fade-in duration-200">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              c.masteryPct >= 70 ? "bg-emerald-500" : c.masteryPct >= 50 ? "bg-amber-500" : "bg-destructive"
                            }`}
                            style={{ width: `${c.masteryPct}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-semibold ${
                          c.masteryPct >= 70 ? "text-emerald-600" : c.masteryPct >= 50 ? "text-amber-600" : "text-destructive"
                        }`}>
                          {c.masteryPct}% mastery
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        among {c.deeplyExplored} students who deeply explored
                      </span>
                    </div>
                  )}
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
