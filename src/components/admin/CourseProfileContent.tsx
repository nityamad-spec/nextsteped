import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Brain, GraduationCap, MessageSquare, ClipboardCheck, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Stats {
  enrolled: number;
  diagnosticSubmitted: number;
  diagnosticAvg: number | null;
  diagnosticDoneStudents: StudentLite[];
  diagnosticPendingStudents: StudentLite[];
  masteryBands: { beginner: number; developing: number; proficient: number; expert: number; none: number };
  masteryAvgPct: number | null;
  completed: number;
  completedStudents: StudentLite[];
  notCompletedStudents: StudentLite[];
  quizAttempts: number;
  quizStudents: number;
  quizAvg: number | null;
  quizzesTotal: number;
  quizCompletedAll: StudentLite[];
  quizPartial: (StudentLite & { done: number; remaining: number })[];
  quizNotStarted: StudentLite[];
  examAttempts: number;
  examStudents: number;
  examAvg: number | null;
  examsTotal: number;
  examCompletedAll: StudentLite[];
  examNotCompleted: StudentLite[];
  chatStudents: number;
  chatMessages: number;
}

interface RawData {
  enrollments: { student_id: string }[];
  profiles: { id: string; university_id: string | null; name: string | null; email: string | null }[];
  universities: { id: string; name: string }[];
  diagnostics: { student_id: string; score: number | null; total_questions: number | null }[];
  mastery: { student_id: string; mastery_score: number | null; learner_level: string | null }[];
  exams: { id: string; archived_at: string | null }[];
  results: { student_id: string; mode: string | null; quiz_day: number | null; exam_id: string | null; score: number | null; total_questions: number | null }[];
  chatSessions: { id: string; user_id: string }[];
  chatMessageSessionIds: string[];
}

interface StudentLite { id: string; name: string | null; email: string | null }

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

const ALL = "__all__";
const NONE = "__none__";

interface Props {
  courseId: string | null;
  courseName?: string | null;
  /** When "page", drop max-height scroll constraints so the parent page scrolls naturally. */
  variant?: "dialog" | "page";
}

const CourseProfileContent = ({ courseId, courseName, variant = "dialog" }: Props) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [universityFilter, setUniversityFilter] = useState<string>(ALL);
  type RosterView = "done" | "pending" | "completed" | "not-completed" | "quiz-completed" | "quiz-partial" | "quiz-not-started" | "exam-completed" | "exam-not-completed";
  const [rosterView, setRosterView] = useState<RosterView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const load = useCallback(async (cid: string, showSkeleton: boolean) => {
    if (showSkeleton) setLoading(true);

    const [enrRes, diagRes, masteryRes, examsRes, resultsRes, chatSessionsRes] = await Promise.all([
      supabase.from("enrollments").select("student_id").eq("course_id", cid),
      supabase.from("diagnostic_results").select("student_id, score, total_questions").eq("course_id", cid),
      supabase.from("student_course_mastery").select("student_id, mastery_score, learner_level").eq("course_id", cid),
      supabase.from("course_exams").select("id, archived_at").eq("course_id", cid),
      supabase
        .from("assessment_results")
        .select("student_id, mode, quiz_day, exam_id, score, total_questions")
        .eq("course_id", cid),
      supabase.from("chat_sessions").select("id, user_id").eq("course_id", cid),
    ]);

    const enrollments = (enrRes.data || []) as { student_id: string }[];
    const studentIds = Array.from(new Set(enrollments.map(e => e.student_id)));

    let profiles: RawData["profiles"] = [];
    let universities: { id: string; name: string }[] = [];
    if (studentIds.length > 0) {
      const profRes = await supabase
        .from("profiles")
        .select("id, university_id, name, email")
        .in("id", studentIds);
      profiles = (profRes.data || []) as RawData["profiles"];
      const uniIds = Array.from(new Set(profiles.map(p => p.university_id).filter((v): v is string => !!v)));
      if (uniIds.length > 0) {
        const uniRes = await supabase.from("universities").select("id, name").in("id", uniIds);
        universities = (uniRes.data || []) as { id: string; name: string }[];
      }
    }

    const sessionIds = (chatSessionsRes.data || []).map(s => s.id as string);
    let chatMessageSessionIds: string[] = [];
    if (sessionIds.length > 0) {
      const msgRes = await supabase
        .from("chat_messages")
        .select("session_id")
        .in("session_id", sessionIds);
      chatMessageSessionIds = ((msgRes.data || []) as { session_id: string }[]).map(m => m.session_id);
    }

    setRaw({
      enrollments,
      profiles,
      universities,
      diagnostics: (diagRes.data || []) as RawData["diagnostics"],
      mastery: (masteryRes.data || []) as RawData["mastery"],
      exams: (examsRes.data || []) as RawData["exams"],
      results: (resultsRes.data || []) as RawData["results"],
      chatSessions: (chatSessionsRes.data || []) as RawData["chatSessions"],
      chatMessageSessionIds,
    });
    if (showSkeleton) setLoading(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!courseId || refreshing) return;
    setRefreshing(true);
    try {
      await load(courseId, false);
    } finally {
      setRefreshing(false);
    }
  }, [courseId, refreshing, load]);

  useEffect(() => {
    if (!courseId) return;
    const cid = courseId;
    setUniversityFilter(ALL);
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
      .channel(`course-profile-${cid}`)
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
  }, [courseId, load]);

  const uniOptions = useMemo(() => {
    if (!raw) return [] as { value: string; label: string; count: number }[];
    const uniNameById = new Map(raw.universities.map(u => [u.id, u.name]));
    const counts = new Map<string, number>();
    const enrolledSet = new Set(raw.enrollments.map(e => e.student_id));
    raw.profiles.forEach(p => {
      if (!enrolledSet.has(p.id)) return;
      const key = p.university_id || NONE;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    enrolledSet.forEach(sid => {
      if (!raw.profiles.find(p => p.id === sid)) {
        counts.set(NONE, (counts.get(NONE) || 0) + 1);
      }
    });
    const opts: { value: string; label: string; count: number }[] = [];
    counts.forEach((count, key) => {
      if (key === NONE) opts.push({ value: NONE, label: "No university set", count });
      else opts.push({ value: key, label: uniNameById.get(key) || "Unknown university", count });
    });
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [raw]);

  const filteredIds = useMemo(() => {
    if (!raw) return new Set<string>();
    const enrolledSet = new Set(raw.enrollments.map(e => e.student_id));
    if (universityFilter === ALL) return enrolledSet;
    const profByStudent = new Map(raw.profiles.map(p => [p.id, p.university_id]));
    const out = new Set<string>();
    enrolledSet.forEach(sid => {
      const uid = profByStudent.get(sid) ?? null;
      if (universityFilter === NONE) {
        if (!uid) out.add(sid);
      } else if (uid === universityFilter) {
        out.add(sid);
      }
    });
    return out;
  }, [raw, universityFilter]);

  const stats: Stats | null = useMemo(() => {
    if (!raw) return null;
    const enrolledIds = filteredIds;
    const enrolled = enrolledIds.size;

    const diagStudents = new Set<string>();
    let diagPctSum = 0, diagPctN = 0;
    raw.diagnostics.forEach(d => {
      if (!enrolledIds.has(d.student_id)) return;
      diagStudents.add(d.student_id);
      const total = Number(d.total_questions) || 0;
      const score = Number(d.score) || 0;
      if (total > 0) { diagPctSum += score / total; diagPctN += 1; }
    });

    const profById = new Map(raw.profiles.map(p => [p.id, p]));
    const toLite = (sid: string): StudentLite => {
      const p = profById.get(sid);
      return { id: sid, name: p?.name ?? null, email: p?.email ?? null };
    };
    const sortLite = (a: StudentLite, b: StudentLite) =>
      (a.name || a.email || "").localeCompare(b.name || b.email || "");
    const diagnosticDoneStudents: StudentLite[] = [];
    const diagnosticPendingStudents: StudentLite[] = [];
    enrolledIds.forEach(sid => {
      (diagStudents.has(sid) ? diagnosticDoneStudents : diagnosticPendingStudents).push(toLite(sid));
    });
    diagnosticDoneStudents.sort(sortLite);
    diagnosticPendingStudents.sort(sortLite);

    const bands = { beginner: 0, developing: 0, proficient: 0, expert: 0, none: 0 };
    const masteryByStudent = new Map<string, { score: number | null; level: string | null }>();
    let masterySum = 0, masteryN = 0;
    raw.mastery.forEach(m => {
      if (!enrolledIds.has(m.student_id)) return;
      const score = m.mastery_score != null ? Number(m.mastery_score) : null;
      masteryByStudent.set(m.student_id, { score, level: m.learner_level || null });
      if (score != null) { masterySum += score; masteryN += 1; }
      const lvl = (m.learner_level || "").toLowerCase();
      if (lvl === "expert") bands.expert += 1;
      else if (lvl === "proficient") bands.proficient += 1;
      else if (lvl === "developing") bands.developing += 1;
      else if (lvl === "beginner") bands.beginner += 1;
      else bands.none += 1;
    });
    enrolledIds.forEach(sid => { if (!masteryByStudent.has(sid)) bands.none += 1; });

    const activeExams = raw.exams.filter(e => !e.archived_at);
    const activeExamIds = new Set(activeExams.map(e => e.id));
    const examsTotal = activeExams.length;

    const quizDaysSeen = new Set<number>();
    const quizByStudent = new Map<string, Set<number>>();
    const examByStudent = new Map<string, Set<string>>();
    const activeExamByStudent = new Map<string, Set<string>>();
    let quizPctSum = 0, quizPctN = 0, quizAttempts = 0;
    let examPctSum = 0, examPctN = 0, examAttempts = 0;

    raw.results.forEach(r => {
      if (!enrolledIds.has(r.student_id)) return;
      const total = Number(r.total_questions) || 0;
      const pct = Number(r.score) / 100;
      if (r.mode === "daily_quiz" && r.quiz_day != null) {
        quizDaysSeen.add(Number(r.quiz_day));
        quizAttempts += 1;
        if (total > 0) { quizPctSum += pct; quizPctN += 1; }
        const set = quizByStudent.get(r.student_id) || new Set<number>();
        set.add(Number(r.quiz_day));
        quizByStudent.set(r.student_id, set);
      } else if (r.mode === "exam") {
        examAttempts += 1;
        if (total > 0) { examPctSum += pct; examPctN += 1; }
        const key = r.exam_id || "__no_exam__";
        const set = examByStudent.get(r.student_id) || new Set<string>();
        set.add(key);
        examByStudent.set(r.student_id, set);
        if (r.exam_id && activeExamIds.has(r.exam_id)) {
          const aset = activeExamByStudent.get(r.student_id) || new Set<string>();
          aset.add(r.exam_id);
          activeExamByStudent.set(r.student_id, aset);
        }
      }
    });

    const quizzesTotal = quizDaysSeen.size;

    let completed = 0;
    const completedStudents: StudentLite[] = [];
    const notCompletedStudents: StudentLite[] = [];
    enrolledIds.forEach(sid => {
      const m = masteryByStudent.get(sid);
      const level = (m?.level || "").toLowerCase();
      const masteryOk = level === "proficient" || level === "expert";
      const quizzesOk = quizzesTotal > 0 && (quizByStudent.get(sid)?.size || 0) >= quizzesTotal;
      const examsOk = examsTotal === 0 || (activeExamByStudent.get(sid)?.size || 0) >= examsTotal;
      if (masteryOk && quizzesOk && examsOk) { completed += 1; completedStudents.push(toLite(sid)); }
      else notCompletedStudents.push(toLite(sid));
    });
    completedStudents.sort(sortLite);
    notCompletedStudents.sort(sortLite);

    const quizCompletedAll: StudentLite[] = [];
    const quizPartial: (StudentLite & { done: number; remaining: number })[] = [];
    const quizNotStarted: StudentLite[] = [];
    enrolledIds.forEach(sid => {
      const done = quizByStudent.get(sid)?.size ?? 0;
      if (quizzesTotal > 0 && done >= quizzesTotal) quizCompletedAll.push(toLite(sid));
      else if (done >= 1 && done < quizzesTotal) quizPartial.push({ ...toLite(sid), done, remaining: quizzesTotal - done });
      else quizNotStarted.push(toLite(sid));
    });
    quizCompletedAll.sort(sortLite);
    quizPartial.sort(sortLite);
    quizNotStarted.sort(sortLite);

    const examCompletedAll: StudentLite[] = [];
    const examNotCompleted: StudentLite[] = [];
    if (examsTotal > 0) {
      enrolledIds.forEach(sid => {
        const done = activeExamByStudent.get(sid)?.size ?? 0;
        if (done >= examsTotal) examCompletedAll.push(toLite(sid));
        else examNotCompleted.push(toLite(sid));
      });
      examCompletedAll.sort(sortLite);
      examNotCompleted.sort(sortLite);
    }

    const chatStudents = new Set<string>();
    const allowedSessionIds = new Set<string>();
    raw.chatSessions.forEach(s => {
      if (enrolledIds.has(s.user_id)) {
        chatStudents.add(s.user_id);
        allowedSessionIds.add(s.id);
      }
    });
    const chatMessages = raw.chatMessageSessionIds.reduce(
      (acc, sid) => acc + (allowedSessionIds.has(sid) ? 1 : 0),
      0,
    );

    return {
      enrolled,
      diagnosticSubmitted: diagStudents.size,
      diagnosticAvg: diagPctN > 0 ? diagPctSum / diagPctN : null,
      diagnosticDoneStudents,
      diagnosticPendingStudents,
      masteryBands: bands,
      masteryAvgPct: masteryN > 0 ? masterySum / masteryN : null,
      completed,
      completedStudents,
      notCompletedStudents,
      quizAttempts,
      quizStudents: quizByStudent.size,
      quizAvg: quizPctN > 0 ? quizPctSum / quizPctN : null,
      quizzesTotal,
      quizCompletedAll,
      quizPartial,
      quizNotStarted,
      examAttempts,
      examStudents: examByStudent.size,
      examAvg: examPctN > 0 ? examPctSum / examPctN : null,
      examsTotal,
      examCompletedAll,
      examNotCompleted,
      chatStudents: chatStudents.size,
      chatMessages,
    };
  }, [raw, filteredIds]);

  const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.floor(v * 100)}%`);
  const total = stats?.enrolled || 0;
  const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const totalEnrolledAll = raw?.enrollments.length || 0;
  

  const scrollClass =
    variant === "page"
      ? "[&>[data-radix-scroll-area-viewport]]:max-h-none"
      : "flex-1 min-h-0 -mx-6 px-6 [&>[data-radix-scroll-area-viewport]]:max-h-[65vh]";

  const body = (
    <ScrollArea className={scrollClass}>
      {loading || !stats ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">University:</span>
            <Select value={universityFilter} onValueChange={setUniversityFilter}>
              <SelectTrigger className="h-8 w-auto min-w-[220px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All universities ({totalEnrolledAll})</SelectItem>
                {uniOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label} ({o.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {uniOptions.length === 0 && (
              <span className="text-muted-foreground italic">No university data on roster</span>
            )}
            {universityFilter !== ALL && (
              <span className="text-muted-foreground">
                Showing <span className="text-foreground font-medium">{stats.enrolled}</span> of {totalEnrolledAll} students
              </span>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" /> Enrollment & Diagnostic
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Stat label="Enrolled" value={stats.enrolled} />
              <Stat
                label="Diagnostic done"
                value={`${stats.diagnosticSubmitted}/${stats.enrolled}`}
                sub={`${pctOf(stats.diagnosticSubmitted)}%`}
                onClick={stats.diagnosticDoneStudents.length > 0 ? () => setRosterView("done") : undefined}
              />
              <Stat
                label="Pending diagnostic"
                value={stats.diagnosticPendingStudents.length}
                onClick={stats.diagnosticPendingStudents.length > 0 ? () => setRosterView("pending") : undefined}
              />
              <Stat label="Avg diagnostic" value={fmtPct(stats.diagnosticAvg)} />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Brain className="h-4 w-4" /> Course mastery
              </div>
              <div className="text-xs text-muted-foreground">
                Avg: <span className="text-foreground font-medium tabular-nums">{fmtPct(stats.masteryAvgPct)}</span>
              </div>
            </div>

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

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Course completion
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {pctOf(stats.completed)}% of {stats.enrolled}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Stat
                label="Completed"
                value={stats.completed}
                sub={`${pctOf(stats.completed)}%`}
                onClick={stats.completedStudents.length > 0 ? () => setRosterView("completed") : undefined}
              />
              <Stat
                label="Not completed"
                value={stats.notCompletedStudents.length}
                sub={`${pctOf(stats.notCompletedStudents.length)}%`}
                onClick={stats.notCompletedStudents.length > 0 ? () => setRosterView("not-completed") : undefined}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              All {stats.quizzesTotal} weekly quizzes & {stats.examsTotal} exams submitted, mastery ≥ Proficient.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardCheck className="h-4 w-4" /> Assessment activity
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border bg-background p-2.5 space-y-1">
                <div className="font-medium">Weekly quizzes <span className="text-muted-foreground font-normal">({stats.quizzesTotal} total)</span></div>
                {stats.quizzesTotal > 0 && (
                  <>
                    <QuizRow
                      label={`Completed all ${stats.quizzesTotal}`}
                      count={stats.quizCompletedAll.length}
                      onClick={stats.quizCompletedAll.length > 0 ? () => setRosterView("quiz-completed") : undefined}
                    />
                    <QuizRow
                      label={`Partially done (1–${stats.quizzesTotal - 1})`}
                      count={stats.quizPartial.length}
                      onClick={stats.quizPartial.length > 0 ? () => setRosterView("quiz-partial") : undefined}
                    />
                  </>
                )}
                <QuizRow
                  label="Not started (0)"
                  count={stats.quizNotStarted.length}
                  onClick={stats.quizNotStarted.length > 0 ? () => setRosterView("quiz-not-started") : undefined}
                />
                <div className="text-muted-foreground pt-1">Total attempts: <span className="text-foreground tabular-nums">{stats.quizAttempts}</span></div>
                <div className="text-muted-foreground">Avg score: <span className="text-foreground tabular-nums">{fmtPct(stats.quizAvg)}</span></div>
              </div>
              <div className="rounded-md border bg-background p-2.5 space-y-1">
                <div className="font-medium">Exams <span className="text-muted-foreground font-normal">({stats.examsTotal} active)</span></div>
                {stats.examsTotal > 0 ? (
                  <>
                    <QuizRow
                      label={`Completed all ${stats.examsTotal} exam${stats.examsTotal === 1 ? "" : "s"}`}
                      count={stats.examCompletedAll.length}
                      onClick={stats.examCompletedAll.length > 0 ? () => setRosterView("exam-completed") : undefined}
                    />
                    <QuizRow
                      label="Not completed"
                      count={stats.examNotCompleted.length}
                      onClick={stats.examNotCompleted.length > 0 ? () => setRosterView("exam-not-completed") : undefined}
                    />
                  </>
                ) : (
                  <div className="text-muted-foreground">No active exams</div>
                )}
                <div className="text-muted-foreground pt-1">Total attempts: <span className="text-foreground tabular-nums">{stats.examAttempts}</span></div>
                <div className="text-muted-foreground">Avg score: <span className="text-foreground tabular-nums">{fmtPct(stats.examAvg)}</span></div>
              </div>
            </div>
          </div>

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
  );

  return (
    <>
      {body}

      <Dialog open={!!rosterView} onOpenChange={(o) => { if (!o) setRosterView(null); }}>
        <DialogContent className="max-w-md max-h-[75vh] flex flex-col">
          {(() => {
            const qt = stats?.quizzesTotal ?? 0;
            const cfg: Record<RosterView, { title: string; list: ReadonlyArray<StudentLite & { done?: number; remaining?: number }>; desc: (n: number) => string }> = {
              "done": { title: "Diagnostic done", list: stats?.diagnosticDoneStudents ?? [], desc: (n) => `${n} students submitted the diagnostic.` },
              "pending": { title: "Pending diagnostic", list: stats?.diagnosticPendingStudents ?? [], desc: (n) => `${n} enrolled students have not submitted yet.` },
              "completed": { title: "Completed course", list: stats?.completedStudents ?? [], desc: (n) => `${n} students completed all quizzes & exams with mastery ≥ Proficient.` },
              "not-completed": { title: "Not completed", list: stats?.notCompletedStudents ?? [], desc: (n) => `${n} enrolled students have not completed the course.` },
              "quiz-completed": { title: `Completed all ${qt} weekly quizzes`, list: stats?.quizCompletedAll ?? [], desc: (n) => `${n} students submitted every weekly quiz.` },
              "quiz-partial": { title: `Partially done (1–${Math.max(qt - 1, 0)} quizzes)`, list: stats?.quizPartial ?? [], desc: (n) => `${n} students started but have not finished all ${qt} weekly quizzes.` },
              "quiz-not-started": { title: "Not started weekly quizzes", list: stats?.quizNotStarted ?? [], desc: (n) => `${n} enrolled students have not submitted any weekly quiz.` },
              "exam-completed": { title: `Completed all ${stats?.examsTotal ?? 0} exam${(stats?.examsTotal ?? 0) === 1 ? "" : "s"}`, list: stats?.examCompletedAll ?? [], desc: (n) => `${n} students submitted every active exam.` },
              "exam-not-completed": { title: "Exams not completed", list: stats?.examNotCompleted ?? [], desc: (n) => `${n} enrolled students have not submitted all active exams.` },
            };
            const c = rosterView ? cfg[rosterView] : null;
            const list = c?.list ?? [];
            const isPartial = rosterView === "quiz-partial";
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {c?.title}
                    {courseName ? ` — ${courseName}` : ""}
                  </DialogTitle>
                  <DialogDescription>{c?.desc(list.length)}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 [&>[data-radix-scroll-area-viewport]]:max-h-[55vh]">
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No students.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {list.map(s => (
                        <li key={s.id} className="py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-sm font-medium text-foreground">{s.name || "(no name)"}</div>
                            {isPartial && s.done != null && (
                              <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                                {s.done} of {qt} done · {s.remaining} left
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{s.email || "(no email)"}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

const Stat = ({ label, value, sub, onClick }: { label: string; value: number | string; sub?: string; onClick?: () => void }) => {
  const inner = (
    <>
      <div className="text-muted-foreground mb-0.5">{label}</div>
      <div className="font-semibold text-foreground tabular-nums">
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-muted-foreground">· {sub}</span>}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-muted/60 hover:underline underline-offset-2 transition-colors"
      >
        {inner}
      </button>
    );
  }
  return <div>{inner}</div>;
};

const QuizRow = ({ label, count, onClick }: { label: string; count: number; onClick?: () => void }) => {
  const content = (
    <div className="flex items-center justify-between gap-2 w-full">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground tabular-nums font-medium">{count}</span>
    </div>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-sm -mx-1 px-1 py-0.5 hover:bg-muted/60 hover:underline underline-offset-2 transition-colors text-left"
      >
        {content}
      </button>
    );
  }
  return content;
};

export default CourseProfileContent;
