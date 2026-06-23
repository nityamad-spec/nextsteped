import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, CheckCircle2, Clock, GraduationCap, Mail, Hash, Calendar } from "lucide-react";
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
  expertConcepts: number;
  totalConcepts: number;
  complete: boolean;
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

interface Props {
  student: StudentLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StudentProfileDialog = ({ student, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CourseDetail[]>([]);

  const loadDetails = useCallback(async (s: StudentLite, ids: string[], showSkeleton: boolean) => {
    const studentIds = s.profileIds;
    if (showSkeleton) setLoading(true);

    const [masteryRes, weeksRes, resultsRes, conceptsRes, conceptMasteryRes] = await Promise.all([
      supabase
        .from("student_course_mastery")
        .select("course_id, student_id, mastery_score, learner_level")
        .in("student_id", studentIds)
        .in("course_id", ids),
      supabase
        .from("lesson_plan_weeks")
        .select("course_id, week_number, is_exam_week")
        .in("course_id", ids),
      supabase
        .from("assessment_results")
        .select("course_id, mode, quiz_day")
        .in("student_id", studentIds)
        .in("course_id", ids),
      supabase
        .from("concepts")
        .select("id, course_id")
        .in("course_id", ids),
      supabase
        .from("student_concept_mastery")
        .select("course_id, concept_id, mastery_level")
        .in("student_id", studentIds)
        .in("course_id", ids),
    ]);

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

    const expertByCourse = new Map<string, Set<string>>();
    (conceptMasteryRes.data || []).forEach(cm => {
      if ((cm.mastery_level || "").toLowerCase() === "expert") {
        const set = expertByCourse.get(cm.course_id) || new Set<string>();
        set.add(cm.concept_id);
        expertByCourse.set(cm.course_id, set);
      }
    });

    const out: CourseDetail[] = s.courses.map(c => {
      const weeks = weeksByCourse.get(c.courseId) || [];
      const quizzesTotal = weeks.filter(w => !w.is_exam_week).length;
      const examsTotal = weeks.filter(w => w.is_exam_week).length;

      const m = masteryMap.get(c.courseId);
      const quizzesDone = quizDaysByCourse.get(c.courseId)?.size || 0;
      const examsDone = examsByCourse.get(c.courseId) || 0;

      const done = quizzesDone + examsDone;
      const total = quizzesTotal + examsTotal;
      const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      const progressLabel = total > 0 ? `${done} of ${total} assessments` : "No assessments yet";

      const complete = total > 0 && done >= total;

      return {
        courseId: c.courseId,
        name: c.name,
        enrolledAt: c.enrolledAt,
        masteryScore: m?.score ?? null,
        masteryLevel: m?.level ?? null,
        progressPct,
        progressLabel,
        quizzesDone,
        quizzesTotal,
        examsDone,
        examsTotal,
        expertConcepts: expertByCourse.get(c.courseId)?.size || 0,
        totalConcepts: conceptsTotalByCourse.get(c.courseId) || 0,
        complete,
      };
    });

    setDetails(out);
    if (showSkeleton) setLoading(false);
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !student) return;
    const ids = student.courses.map(c => c.courseId);
    if (ids.length === 0) {
      setDetails([]);
      return;
    }

    const studentIdSet = new Set(student.profileIds);
    const courseIdSet = new Set(ids);

    loadDetails(student, ids, true);

    const scheduleReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadDetails(student, ids, false);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_results" }, (payload) => {
        if (matches(payload)) scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_course_mastery" }, (payload) => {
        if (matches(payload)) scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_concept_mastery" }, (payload) => {
        if (matches(payload)) scheduleReload();
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [open, student, loadDetails]);

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
            <div className="space-y-3 py-2">
              {details.map(d => (
                <div key={d.courseId} className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{d.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Enrolled {new Date(d.enrolledAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 gap-1",
                        d.complete
                          ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {d.complete ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {d.complete ? "Complete" : "In progress"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground mb-1">Mastery score</div>
                      <div className="font-semibold text-foreground tabular-nums">
                        {d.masteryScore != null ? `${Math.floor(d.masteryScore)}%` : "—"}
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
                      <span className="text-muted-foreground">Expert concepts</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {d.expertConcepts}/{d.totalConcepts || 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default StudentProfileDialog;
