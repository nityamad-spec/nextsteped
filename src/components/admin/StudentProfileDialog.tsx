import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BookOpen, CheckCircle2, Clock, GraduationCap, Mail, Hash, Calendar,
  MessageSquare, Activity, ChevronDown, TrendingUp, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CourseEnrollmentLite {
  courseId: string;
  name: string;
  enrolledAt: string;
}

interface StudentLite {
  primaryProfileId: string;
  profileIds: string[];
  name: string;
  email: string | null;
  roll_number: string | null;
  created_at: string;
  courses: CourseEnrollmentLite[];
}

interface CourseDetail {
  courseId: string;
  name: string;
  enrolledAt: string;
  masteryScore: number | null;
  masteryLevel: string | null;
  progressPct: number;
  progressLabel: string;
  quizzesDone: number;
  quizzesTotal: number;
  examsDone: number;
  examsTotal: number;
  proficientConcepts: number;
  totalConcepts: number;
  startingMasteryLevel: string | null;
  startingMasteryScore: number | null;
  complete: boolean;
}

interface Attempt {
  id: string;
  created_at: string;
  scorePct: number;
  timeSec: number;
}

interface QuizGroup { key: number; bestPct: number; attempts: Attempt[]; }
interface ExamGroup { key: string; label: string; bestPct: number; attempts: Attempt[]; }
interface ConceptRow { code: string; level: string; score: number; }

interface CourseInsights {
  quizzes: QuizGroup[];
  exams: ExamGroup[];
  strong: ConceptRow[];
  weak: ConceptRow[];
  chatSessions: number;
  chatMessages: number;
  lastChatAt: string | null;
  practiceAttempts: number;
  practiceAccuracyPct: number | null;
  totalAssessmentTimeSec: number;
  avgTimePerQuestionSec: number | null;
}

const masteryClass = (level: string | null) => {
  switch ((level || "").toLowerCase()) {
    case "expert": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "proficient": return "bg-blue-500/15 text-blue-600 border-blue-500/30";
    case "developing": return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "beginner": return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

const fmtTime = (sec: number) => {
  if (!sec || sec < 1) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const sumTimes = (qt: unknown): number => {
  if (!Array.isArray(qt)) return 0;
  let total = 0;
  for (const t of qt) {
    const n = typeof t === "number" ? t : Number(t);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total / 1000;
};

const countTimes = (qt: unknown): number => Array.isArray(qt) ? qt.length : 0;

interface Props {
  student: StudentLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StudentProfileDialog = ({ student, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CourseDetail[]>([]);
  const [expandedCourse, setExpandedCourse] = useState<string | undefined>(undefined);
  const [insightsCache, setInsightsCache] = useState<Record<string, CourseInsights | "loading">>({});

  const loadDetails = useCallback(async (s: StudentLite, ids: string[], showSkeleton: boolean) => {
    const studentIds = s.profileIds;
    if (showSkeleton) setLoading(true);

    const [masteryRes, weeksRes, resultsRes, conceptsRes, conceptMasteryRes, courseExamsRes] = await Promise.all([
      supabase.from("student_course_mastery")
        .select("course_id, student_id, mastery_score, learner_level")
        .in("student_id", studentIds).in("course_id", ids),
      supabase.from("lesson_plan_weeks")
        .select("course_id, week_number, is_exam_week").in("course_id", ids),
      supabase.from("assessment_results")
        .select("course_id, mode, quiz_day").in("student_id", studentIds).in("course_id", ids),
      supabase.from("concepts").select("id, course_id").in("course_id", ids),
      supabase.from("student_concept_mastery")
        .select("course_id, concept_id, mastery_level")
        .in("student_id", studentIds).in("course_id", ids),
      supabase.from("course_exams")
        .select("course_id, published_at, archived_at").in("course_id", ids),
      supabase.from("diagnostic_results")
        .select("course_id, learner_level, mastery_score, score, created_at")
        .in("student_id", studentIds).in("course_id", ids)
        .order("created_at", { ascending: true }),
    ]);

    const examsTotalByCourse = new Map<string, number>();
    (courseExamsRes.data || []).forEach(e => {
      if (e.archived_at || !e.published_at) return;
      examsTotalByCourse.set(e.course_id, (examsTotalByCourse.get(e.course_id) || 0) + 1);
    });

    const startingByCourse = new Map<string, { level: string | null; score: number | null }>();
    (diagRes.data || []).forEach(d => {
      if (startingByCourse.has(d.course_id)) return;
      const score = d.mastery_score != null ? Number(d.mastery_score)
        : (d.score != null ? Number(d.score) / 100 : null);
      startingByCourse.set(d.course_id, { level: d.learner_level ?? null, score });
    });

    const masteryMap = new Map<string, { score: number | null; level: string | null }>();
    (masteryRes.data || []).forEach(m => {
      const existing = masteryMap.get(m.course_id);
      const score = m.mastery_score != null ? Number(m.mastery_score) : null;
      if (!existing || (score != null && (existing.score == null || score > existing.score))) {
        masteryMap.set(m.course_id, { score, level: m.learner_level });
      }
    });

    const weeksByCourse = new Map<string, { week_number: number; is_exam_week: boolean }[]>();
    (weeksRes.data || []).forEach(w => {
      const arr = weeksByCourse.get(w.course_id) || [];
      arr.push({ week_number: w.week_number, is_exam_week: !!w.is_exam_week });
      weeksByCourse.set(w.course_id, arr);
    });

    const quizDaysByCourse = new Map<string, Set<number>>();
    const examsByCourse = new Map<string, number>();
    (resultsRes.data || []).forEach(r => {
      if (r.mode === "daily_quiz" && r.quiz_day != null) {
        const set = quizDaysByCourse.get(r.course_id) || new Set<number>();
        set.add(r.quiz_day);
        quizDaysByCourse.set(r.course_id, set);
      } else if (r.mode === "exam") {
        examsByCourse.set(r.course_id, (examsByCourse.get(r.course_id) || 0) + 1);
      }
    });

    const conceptsTotalByCourse = new Map<string, number>();
    (conceptsRes.data || []).forEach(c => {
      conceptsTotalByCourse.set(c.course_id, (conceptsTotalByCourse.get(c.course_id) || 0) + 1);
    });

    const proficientByCourse = new Map<string, Set<string>>();
    (conceptMasteryRes.data || []).forEach(cm => {
      if ((cm.mastery_level || "").toLowerCase() === "proficient") {
        const set = proficientByCourse.get(cm.course_id) || new Set<string>();
        set.add(cm.concept_id);
        proficientByCourse.set(cm.course_id, set);
      }
    });

    const out: CourseDetail[] = s.courses.map(c => {
      const weeks = weeksByCourse.get(c.courseId) || [];
      const quizzesTotal = weeks.filter(w => !w.is_exam_week).length;
      const examsTotal = examsTotalByCourse.get(c.courseId) || 0;

      const m = masteryMap.get(c.courseId);
      const quizzesDone = quizDaysByCourse.get(c.courseId)?.size || 0;
      const examsDone = examsByCourse.get(c.courseId) || 0;

      const done = quizzesDone + examsDone;
      const total = quizzesTotal + examsTotal;
      const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      const progressLabel = total > 0 ? `${done} of ${total} assessments` : "No assessments yet";
      const complete = total > 0 && done >= total;

      return {
        courseId: c.courseId, name: c.name, enrolledAt: c.enrolledAt,
        masteryScore: m?.score ?? null, masteryLevel: m?.level ?? null,
        progressPct, progressLabel,
        quizzesDone, quizzesTotal, examsDone, examsTotal,
        proficientConcepts: proficientByCourse.get(c.courseId)?.size || 0,
        totalConcepts: conceptsTotalByCourse.get(c.courseId) || 0,
        complete,
      };
    });

    setDetails(out);
    if (showSkeleton) setLoading(false);
  }, []);

  const loadInsights = useCallback(async (s: StudentLite, courseId: string): Promise<CourseInsights> => {
    const studentIds = s.profileIds;
    const [resultsRes, cmRes, conceptsRes, sessionsRes, examsRes] = await Promise.all([
      supabase.from("assessment_results")
        .select("id, mode, quiz_day, exam_id, score, correct_answers, total_questions, question_times, created_at")
        .in("student_id", studentIds).eq("course_id", courseId)
        .order("created_at", { ascending: false }),
      supabase.from("student_concept_mastery")
        .select("concept_id, concept_code, mastery_level, mastery_score")
        .in("student_id", studentIds).eq("course_id", courseId),
      supabase.from("concepts").select("id, concept_code").eq("course_id", courseId),
      supabase.from("chat_sessions")
        .select("id, updated_at").in("user_id", studentIds).eq("course_id", courseId),
      supabase.from("course_exams").select("id, label").eq("course_id", courseId),
    ]);

    const conceptCodeById = new Map<string, string>();
    (conceptsRes.data || []).forEach(c => conceptCodeById.set(c.id, c.concept_code));

    const examLabels = new Map<string, string>();
    (examsRes.data || []).forEach(e => examLabels.set(e.id, e.label));

    // Group results
    const quizMap = new Map<number, Attempt[]>();
    const examMap = new Map<string, Attempt[]>();
    let practiceAttempts = 0;
    let practiceCorrect = 0;
    let practiceTotal = 0;
    let assessTimeSec = 0;
    let assessQCount = 0;

    (resultsRes.data || []).forEach(r => {
      const rawPct = typeof r.score === "number" ? r.score : 0;
      const scorePct = Math.max(0, Math.min(100, Math.floor(rawPct)));
      const timeSec = sumTimes(r.question_times);
      const attempt: Attempt = { id: r.id, created_at: r.created_at, scorePct, timeSec };

      if (r.mode === "daily_quiz" && r.quiz_day != null) {
        const arr = quizMap.get(r.quiz_day) || [];
        arr.push(attempt); quizMap.set(r.quiz_day, arr);
        assessTimeSec += timeSec; assessQCount += countTimes(r.question_times);
      } else if (r.mode === "exam" && r.exam_id) {
        const arr = examMap.get(r.exam_id) || [];
        arr.push(attempt); examMap.set(r.exam_id, arr);
        assessTimeSec += timeSec; assessQCount += countTimes(r.question_times);
      } else if (r.mode === "practice") {
        practiceAttempts += 1;
        practiceCorrect += r.correct_answers || 0;
        practiceTotal += r.total_questions || 0;
      }
    });

    const quizzes: QuizGroup[] = Array.from(quizMap.entries())
      .map(([key, attempts]) => ({
        key,
        attempts: attempts.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        bestPct: Math.max(...attempts.map(a => a.scorePct)),
      }))
      .sort((a, b) => a.key - b.key);

    const exams: ExamGroup[] = Array.from(examMap.entries())
      .map(([key, attempts]) => ({
        key,
        label: examLabels.get(key) || key,
        attempts: attempts.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        bestPct: Math.max(...attempts.map(a => a.scorePct)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Concepts: dedupe by concept_id, keep best score
    const perConcept = new Map<string, ConceptRow>();
    (cmRes.data || []).forEach(cm => {
      const key = cm.concept_id;
      const code = cm.concept_code || conceptCodeById.get(cm.concept_id) || "Unknown";
      const score = cm.mastery_score != null ? Number(cm.mastery_score) : 0;
      const existing = perConcept.get(key);
      if (!existing || score > existing.score) {
        perConcept.set(key, { code, level: (cm.mastery_level || "").toLowerCase(), score });
      }
    });
    const allConcepts = Array.from(perConcept.values());
    const strong = allConcepts.filter(c => c.level === "proficient" || c.level === "expert")
      .sort((a, b) => b.score - a.score);
    const weak = allConcepts.filter(c => c.level === "beginner" || c.level === "developing")
      .sort((a, b) => a.score - b.score);

    // Chat
    const sessionIds = (sessionsRes.data || []).map(s => s.id);
    let chatMessages = 0;
    if (sessionIds.length > 0) {
      const { count } = await supabase.from("chat_messages")
        .select("id", { count: "exact", head: true }).in("session_id", sessionIds);
      chatMessages = count || 0;
    }
    const lastChatAt = (sessionsRes.data || [])
      .map(s => s.updated_at).sort().reverse()[0] || null;

    return {
      quizzes, exams, strong, weak,
      chatSessions: sessionIds.length,
      chatMessages,
      lastChatAt,
      practiceAttempts,
      practiceAccuracyPct: practiceTotal > 0 ? Math.floor((practiceCorrect / practiceTotal) * 100) : null,
      totalAssessmentTimeSec: assessTimeSec,
      avgTimePerQuestionSec: assessQCount > 0 ? assessTimeSec / assessQCount : null,
    };
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !student) return;
    const ids = student.courses.map(c => c.courseId);
    if (ids.length === 0) { setDetails([]); return; }

    const studentIdSet = new Set(student.profileIds);
    const courseIdSet = new Set(ids);

    loadDetails(student, ids, true);

    const scheduleReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadDetails(student, ids, false);
        // Invalidate insights for currently-expanded course
        if (expandedCourse) {
          loadInsights(student, expandedCourse).then(ins => {
            setInsightsCache(prev => ({ ...prev, [expandedCourse]: ins }));
          }).catch(() => {});
        }
      }, 400);
    };

    const matches = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown> | null | undefined;
      if (!row) return false;
      const sid = row.student_id as string | undefined;
      const cid = row.course_id as string | undefined;
      return !!(sid && cid && studentIdSet.has(sid) && courseIdSet.has(cid));
    };

    const channel = supabase
      .channel(`admin-student-${student.primaryProfileId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_results" }, (p) => { if (matches(p)) scheduleReload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_course_mastery" }, (p) => { if (matches(p)) scheduleReload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_concept_mastery" }, (p) => { if (matches(p)) scheduleReload(); })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [open, student, loadDetails, loadInsights, expandedCourse]);

  // Reset expanded state when dialog closes or student changes
  useEffect(() => {
    if (!open) {
      setExpandedCourse(undefined);
      setInsightsCache({});
    }
  }, [open, student?.primaryProfileId]);

  const handleExpand = (courseId: string) => {
    const next = expandedCourse === courseId ? undefined : courseId;
    setExpandedCourse(next);
    if (next && student && !insightsCache[next]) {
      setInsightsCache(prev => ({ ...prev, [next]: "loading" }));
      loadInsights(student, next).then(ins => {
        setInsightsCache(prev => ({ ...prev, [next]: ins }));
      }).catch(() => {
        setInsightsCache(prev => {
          const copy = { ...prev }; delete copy[next]; return copy;
        });
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {student?.name || "Student"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
              {student?.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> <span className="font-mono">{student.email}</span>
                </span>
              )}
              {student?.roll_number && (
                <span className="flex items-center gap-1.5">
                  <Hash className="h-3 w-3" /> {student.roll_number}
                </span>
              )}
              {student?.created_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> joined {new Date(student.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 [&>[data-radix-scroll-area-viewport]]:max-h-[65vh]">
          {loading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : details.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-60" />
              <p className="text-sm">Not enrolled in any courses</p>
            </div>
          ) : (
            <Accordion
              type="single" collapsible value={expandedCourse}
              onValueChange={(v) => handleExpand(v || "")}
              className="space-y-3 py-2"
            >
              {details.map(d => {
                const ins = insightsCache[d.courseId];
                return (
                  <AccordionItem
                    key={d.courseId} value={d.courseId}
                    className="rounded-lg border bg-card px-4 border-b"
                  >
                    <div className="space-y-3 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{d.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Enrolled {new Date(d.enrolledAt).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 gap-1",
                          d.complete ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-muted text-muted-foreground",
                        )}>
                          {d.complete ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {d.complete ? "Complete" : "In progress"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-muted-foreground mb-1">Mastery score</div>
                          <div className="font-semibold text-foreground tabular-nums">
                            {d.masteryScore != null ? `${Math.floor(d.masteryScore * 100)}%` : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Mastery level</div>
                          {d.masteryLevel ? (
                            <Badge variant="outline" className={cn("capitalize", masteryClass(d.masteryLevel))}>
                              {d.masteryLevel}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground italic">none yet</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Course progress</span>
                          <span className="tabular-nums text-foreground">{d.progressLabel} · {d.progressPct}%</span>
                        </div>
                        <Progress value={d.progressPct} className="h-2" />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Weekly quizzes</span>
                          <span className="tabular-nums font-medium text-foreground">
                            {d.quizzesDone}/{d.quizzesTotal || "?"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Exams</span>
                          <span className="tabular-nums font-medium text-foreground">
                            {d.examsDone}/{d.examsTotal || 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Proficient concepts</span>
                          <span className="tabular-nums font-medium text-foreground">
                            {d.proficientConcepts}/{d.totalConcepts || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    <AccordionTrigger className="text-xs py-2 hover:no-underline mt-2 border-t">
                      <span className="text-muted-foreground">Show detailed insights</span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      {!ins || ins === "loading" ? (
                        <div className="space-y-2 py-2">
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-6 w-3/4" />
                        </div>
                      ) : (
                        <InsightsPanel ins={ins} />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

const InsightsPanel = ({ ins }: { ins: CourseInsights }) => {
  const showMax = 8;
  return (
    <div className="space-y-4 pt-1">
      {/* Engagement */}
      <section>
        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Engagement
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Stat label="Chat sessions" value={ins.chatSessions} icon={<MessageSquare className="h-3 w-3" />} />
          <Stat label="Chat messages" value={ins.chatMessages} />
          <Stat label="Last chat" value={ins.lastChatAt ? new Date(ins.lastChatAt).toLocaleDateString() : "—"} />
          <Stat label="Practice attempted" value={ins.practiceAttempts} />
          <Stat label="Practice accuracy" value={ins.practiceAccuracyPct != null ? `${ins.practiceAccuracyPct}%` : "—"} />
          <Stat label="Total assessment time" value={fmtTime(ins.totalAssessmentTimeSec)} />
          <Stat label="Avg time / question" value={ins.avgTimePerQuestionSec != null ? fmtTime(ins.avgTimePerQuestionSec) : "—"} />
        </div>
      </section>

      {/* Quiz performance */}
      <section>
        <h4 className="text-xs font-semibold text-foreground mb-2">Weekly quiz performance</h4>
        {ins.quizzes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No quiz attempts yet.</p>
        ) : (
          <div className="space-y-1">
            {ins.quizzes.map(q => (
              <AttemptGroup
                key={q.key} title={`Week ${q.key}`}
                bestPct={q.bestPct} attempts={q.attempts}
              />
            ))}
          </div>
        )}
      </section>

      {/* Exam performance */}
      <section>
        <h4 className="text-xs font-semibold text-foreground mb-2">Exam performance</h4>
        {ins.exams.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No exam attempts yet.</p>
        ) : (
          <div className="space-y-1">
            {ins.exams.map(e => (
              <AttemptGroup key={e.key} title={e.label} bestPct={e.bestPct} attempts={e.attempts} />
            ))}
          </div>
        )}
      </section>

      {/* Concepts */}
      <section>
        <h4 className="text-xs font-semibold text-foreground mb-2">Concept mastery</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-medium text-emerald-600 mb-1.5 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Strong ({ins.strong.length})
            </div>
            {ins.strong.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">None yet</p>
            ) : (
              <div className="space-y-1">
                {ins.strong.slice(0, showMax).map(c => (
                  <div key={c.code} className="flex items-center justify-between text-[11px] gap-2">
                    <span className="truncate text-foreground">{c.code}</span>
                    <Badge variant="outline" className={cn("capitalize shrink-0 text-[10px] px-1.5 py-0", masteryClass(c.level))}>
                      {c.level}
                    </Badge>
                  </div>
                ))}
                {ins.strong.length > showMax && (
                  <div className="text-[10px] text-muted-foreground">+{ins.strong.length - showMax} more</div>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium text-rose-600 mb-1.5 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Weak ({ins.weak.length})
            </div>
            {ins.weak.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">None</p>
            ) : (
              <div className="space-y-1">
                {ins.weak.slice(0, showMax).map(c => (
                  <div key={c.code} className="flex items-center justify-between text-[11px] gap-2">
                    <span className="truncate text-foreground">{c.code}</span>
                    <Badge variant="outline" className={cn("capitalize shrink-0 text-[10px] px-1.5 py-0", masteryClass(c.level))}>
                      {c.level}
                    </Badge>
                  </div>
                ))}
                {ins.weak.length > showMax && (
                  <div className="text-[10px] text-muted-foreground">+{ins.weak.length - showMax} more</div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

const Stat = ({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-muted-foreground flex items-center gap-1">{icon}{label}</span>
    <span className="tabular-nums font-medium text-foreground">{value}</span>
  </div>
);

const scoreClass = (pct: number) =>
  pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600";

const AttemptGroup = ({ title, bestPct, attempts }: { title: string; bestPct: number; attempts: Attempt[] }) => (
  <Collapsible className="rounded border bg-background/50">
    <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-muted/50 group">
      <span className="font-medium text-foreground truncate">{title}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("tabular-nums font-semibold", scoreClass(bestPct))}>{bestPct}%</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{attempts.length} attempt{attempts.length !== 1 ? "s" : ""}</Badge>
        <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </div>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="border-t divide-y">
        {attempts.map(a => (
          <div key={a.id} className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
            <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">{fmtTime(a.timeSec)}</span>
              <span className={cn("tabular-nums font-semibold w-10 text-right", scoreClass(a.scorePct))}>{a.scorePct}%</span>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
                a.scorePct > 50 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-600 border-rose-500/30")}>
                {a.scorePct > 50 ? "Pass" : "Fail"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleContent>
  </Collapsible>
);

export default StudentProfileDialog;
