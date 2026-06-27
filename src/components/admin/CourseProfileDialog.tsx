import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Users, Brain, GraduationCap, MessageSquare, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CourseLite {
  id: string;
  name: string;
  course_code: string | null;
  term: string;
  teacher_name: string;
  teacher_email: string | null;
  enrollment_code: string;
  published: boolean;
  enrollment_open: boolean;
}

interface Props {
  course: CourseLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Stats {
  enrolled: number;
  diagnosticSubmitted: number;
  diagnosticAvg: number | null;
  masteryBands: { beginner: number; developing: number; proficient: number; expert: number; none: number };
  masteryAvgPct: number | null;
  completed: number;
  quizAttempts: number;
  quizStudents: number;
  quizAvg: number | null;
  quizzesTotal: number;
  examAttempts: number;
  examStudents: number;
  examAvg: number | null;
  examsTotal: number;
  chatStudents: number;
  chatMessages: number;
}

const BAND_KEYS = ["beginner", "developing", "proficient", "expert"] as const;
const BAND_COLORS: Record<typeof BAND_KEYS[number], string> = {
  beginner: "bg-rose-500",
  developing: "bg-amber-500",
  proficient: "bg-blue-500",
  expert: "bg-emerald-500",
};
const BAND_TEXT: Record<typeof BAND_KEYS[number], string> = {
  beginner: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  developing: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  proficient: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  expert: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const CourseProfileDialog = ({ course, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (courseId: string, showSkeleton: boolean) => {
    if (showSkeleton) setLoading(true);

    const [enrRes, diagRes, masteryRes, examsRes, resultsRes, chatSessionsRes] = await Promise.all([
      supabase.from("enrollments").select("student_id").eq("course_id", courseId),
      supabase.from("diagnostic_results").select("student_id, score, total_questions").eq("course_id", courseId),
      supabase.from("student_course_mastery").select("student_id, mastery_score, learner_level").eq("course_id", courseId),
      supabase.from("course_exams").select("id, archived_at").eq("course_id", courseId),
      supabase
        .from("assessment_results")
        .select("student_id, mode, quiz_day, exam_id, score, total_questions")
        .eq("course_id", courseId),
      supabase.from("chat_sessions").select("id, user_id").eq("course_id", courseId),
    ]);

    const enrolledIds = new Set((enrRes.data || []).map(e => e.student_id as string));
    const enrolled = enrolledIds.size;

    // Diagnostic
    const diagStudents = new Set<string>();
    let diagPctSum = 0;
    let diagPctN = 0;
    (diagRes.data || []).forEach(d => {
      const sid = d.student_id as string;
      if (!enrolledIds.has(sid)) return;
      diagStudents.add(sid);
      const total = Number(d.total_questions) || 0;
      const score = Number(d.score) || 0;
      if (total > 0) {
        diagPctSum += score / total;
        diagPctN += 1;
      }
    });

    // Mastery bands
    const bands = { beginner: 0, developing: 0, proficient: 0, expert: 0, none: 0 };
    const masteryByStudent = new Map<string, { score: number | null; level: string | null }>();
    let masterySum = 0;
    let masteryN = 0;
    (masteryRes.data || []).forEach(m => {
      const sid = m.student_id as string;
      if (!enrolledIds.has(sid)) return;
      const score = m.mastery_score != null ? Number(m.mastery_score) : null;
      masteryByStudent.set(sid, { score, level: (m.learner_level as string) || null });
      if (score != null) {
        masterySum += score;
        masteryN += 1;
      }
      const lvl = (m.learner_level || "").toString().toLowerCase();
      if (lvl === "expert") bands.expert += 1;
      else if (lvl === "proficient") bands.proficient += 1;
      else if (lvl === "developing") bands.developing += 1;
      else if (lvl === "beginner") bands.beginner += 1;
      else bands.none += 1;
    });
    // Students with no mastery row at all
    enrolledIds.forEach(sid => {
      if (!masteryByStudent.has(sid)) bands.none += 1;
    });

    // Active exams
    const activeExams = (examsRes.data || []).filter(e => !e.archived_at);
    const activeExamIds = new Set(activeExams.map(e => e.id as string));
    const examsTotal = activeExams.length;

    // Weekly quizzes - count distinct quiz_day across all students' results as the "published" set
    const quizDaysSeen = new Set<number>();
    const quizByStudent = new Map<string, Set<number>>();
    const examByStudent = new Map<string, Set<string>>();
    let quizPctSum = 0, quizPctN = 0, quizAttempts = 0;
    let examPctSum = 0, examPctN = 0, examAttempts = 0;

    (resultsRes.data || []).forEach(r => {
      const sid = r.student_id as string;
      if (!enrolledIds.has(sid)) return;
      const total = Number(r.total_questions) || 0;
      const score = Number(r.score) || 0;

      if (r.mode === "daily_quiz" && r.quiz_day != null) {
        quizDaysSeen.add(Number(r.quiz_day));
        quizAttempts += 1;
        if (total > 0) { quizPctSum += score / total; quizPctN += 1; }
        const set = quizByStudent.get(sid) || new Set<number>();
        set.add(Number(r.quiz_day));
        quizByStudent.set(sid, set);
      } else if (r.mode === "exam") {
        examAttempts += 1;
        if (total > 0) { examPctSum += score / total; examPctN += 1; }
        if (r.exam_id && activeExamIds.has(r.exam_id as string)) {
          const set = examByStudent.get(sid) || new Set<string>();
          set.add(r.exam_id as string);
          examByStudent.set(sid, set);
        }
      }
    });

    const quizzesTotal = quizDaysSeen.size;

    // Completion: every quiz day done, every active exam done, mastery >= proficient
    let completed = 0;
    enrolledIds.forEach(sid => {
      const m = masteryByStudent.get(sid);
      const level = (m?.level || "").toLowerCase();
      const masteryOk = level === "proficient" || level === "expert";
      const quizzesOk = quizzesTotal > 0 && (quizByStudent.get(sid)?.size || 0) >= quizzesTotal;
      const examsOk = examsTotal === 0 || (examByStudent.get(sid)?.size || 0) >= examsTotal;
      if (masteryOk && quizzesOk && examsOk) completed += 1;
    });

    // Chat
    const chatStudents = new Set<string>();
    const sessionIds: string[] = [];
    (chatSessionsRes.data || []).forEach(s => {
      sessionIds.push(s.id as string);
      const uid = s.user_id as string;
      if (enrolledIds.has(uid)) chatStudents.add(uid);
    });
    let chatMessages = 0;
    if (sessionIds.length > 0) {
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds);
      chatMessages = count || 0;
    }

    setStats({
      enrolled,
      diagnosticSubmitted: diagStudents.size,
      diagnosticAvg: diagPctN > 0 ? diagPctSum / diagPctN : null,
      masteryBands: bands,
      masteryAvgPct: masteryN > 0 ? masterySum / masteryN : null,
      completed,
      quizAttempts,
      quizStudents: quizByStudent.size,
      quizAvg: quizPctN > 0 ? quizPctSum / quizPctN : null,
      quizzesTotal,
      examAttempts,
      examStudents: examByStudent.size,
      examAvg: examPctN > 0 ? examPctSum / examPctN : null,
      examsTotal,
      chatStudents: chatStudents.size,
      chatMessages,
    });
    if (showSkeleton) setLoading(false);
  }, []);

  useEffect(() => {
    if (!open || !course) return;
    const cid = course.id;
    load(cid, true);

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(cid, false), 400);
    };

    const matches = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown> | null | undefined;
      return !!row && (row.course_id as string | undefined) === cid;
    };

    const channel = supabase
      .channel(`admin-course-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "enrollments" }, (p) => { if (matches(p)) schedule(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_results" }, (p) => { if (matches(p)) schedule(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "diagnostic_results" }, (p) => { if (matches(p)) schedule(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_course_mastery" }, (p) => { if (matches(p)) schedule(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "course_exams" }, (p) => { if (matches(p)) schedule(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, (p) => { if (matches(p)) schedule(); })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [open, course, load]);

  const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.floor(v * 100)}%`);
  const total = stats?.enrolled || 0;
  const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {course?.name || "Course"}
            {course?.course_code && (
              <span className="text-sm font-normal text-muted-foreground">({course.course_code})</span>
            )}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
              <span>Term: <span className="text-foreground">{course?.term}</span></span>
              <span>Professor: <span className="text-foreground">{course?.teacher_name}</span></span>
              <span>Code: <code className="bg-muted px-1 py-0.5 rounded text-foreground">{course?.enrollment_code}</code></span>
              <Badge variant={course?.published ? "default" : "secondary"} className="text-[10px]">
                {course?.published ? "Published" : "Draft"}
              </Badge>
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 [&>[data-radix-scroll-area-viewport]]:max-h-[65vh]">
          {loading || !stats ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Enrollment & Diagnostic */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" /> Enrollment & Diagnostic
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <Stat label="Enrolled" value={stats.enrolled} />
                  <Stat
                    label="Diagnostic done"
                    value={`${stats.diagnosticSubmitted}/${stats.enrolled}`}
                    sub={`${pctOf(stats.diagnosticSubmitted)}%`}
                  />
                  <Stat label="Avg diagnostic" value={fmtPct(stats.diagnosticAvg)} />
                </div>
              </div>

              {/* Mastery */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4" /> Course mastery
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg: <span className="text-foreground font-medium tabular-nums">{fmtPct(stats.masteryAvgPct)}</span>
                  </div>
                </div>

                {/* Stacked bar */}
                {total > 0 && (
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                    {BAND_KEYS.map(k => {
                      const n = stats.masteryBands[k];
                      const pct = (n / total) * 100;
                      if (pct <= 0) return null;
                      return <div key={k} className={cn("h-full", BAND_COLORS[k])} style={{ width: `${pct}%` }} />;
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {BAND_KEYS.map(k => (
                    <div key={k} className="flex items-center justify-between rounded-md border bg-background px-2 py-1.5">
                      <Badge variant="outline" className={cn("capitalize text-[10px]", BAND_TEXT[k])}>{k}</Badge>
                      <span className="tabular-nums font-medium">{stats.masteryBands[k]}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-md border bg-background px-2 py-1.5">
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wide">No data</span>
                    <span className="tabular-nums font-medium">{stats.masteryBands.none}</span>
                  </div>
                </div>
              </div>

              {/* Completion */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Course completion
                  </div>
                  <div className="text-xs tabular-nums">
                    <span className="text-foreground font-medium">{stats.completed}</span>
                    <span className="text-muted-foreground"> / {stats.enrolled}</span>
                    <span className="text-muted-foreground"> · {pctOf(stats.completed)}%</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  All {stats.quizzesTotal} weekly quizzes & {stats.examsTotal} exams submitted, mastery ≥ Proficient.
                </p>
              </div>

              {/* Assessment activity */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardCheck className="h-4 w-4" /> Assessment activity
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md border bg-background p-2.5 space-y-1">
                    <div className="font-medium">Weekly quizzes</div>
                    <div className="text-muted-foreground">Students attempted: <span className="text-foreground tabular-nums">{stats.quizStudents}</span></div>
                    <div className="text-muted-foreground">Total attempts: <span className="text-foreground tabular-nums">{stats.quizAttempts}</span></div>
                    <div className="text-muted-foreground">Avg score: <span className="text-foreground tabular-nums">{fmtPct(stats.quizAvg)}</span></div>
                  </div>
                  <div className="rounded-md border bg-background p-2.5 space-y-1">
                    <div className="font-medium">Exams <span className="text-muted-foreground font-normal">({stats.examsTotal} active)</span></div>
                    <div className="text-muted-foreground">Students attempted: <span className="text-foreground tabular-nums">{stats.examStudents}</span></div>
                    <div className="text-muted-foreground">Total attempts: <span className="text-foreground tabular-nums">{stats.examAttempts}</span></div>
                    <div className="text-muted-foreground">Avg score: <span className="text-foreground tabular-nums">{fmtPct(stats.examAvg)}</span></div>
                  </div>
                </div>
              </div>

              {/* Chat engagement */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className="h-4 w-4" /> Chat engagement
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs mt-2">
                  <Stat label="Students with chats" value={`${stats.chatStudents}/${stats.enrolled}`} sub={`${pctOf(stats.chatStudents)}%`} />
                  <Stat label="Total messages" value={stats.chatMessages} />
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

const Stat = ({ label, value, sub }: { label: string; value: number | string; sub?: string }) => (
  <div>
    <div className="text-muted-foreground mb-0.5">{label}</div>
    <div className="font-semibold text-foreground tabular-nums">
      {value}
      {sub && <span className="ml-1 text-xs font-normal text-muted-foreground">· {sub}</span>}
    </div>
  </div>
);

export default CourseProfileDialog;
