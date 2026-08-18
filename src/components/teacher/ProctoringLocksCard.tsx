import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldAlert, Loader2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { VOID_LOCK_THRESHOLD, clearVoids } from "@/lib/attemptVoids";

interface VoidRow {
  id: string;
  student_id: string;
  assessment_type: string;
  ref_key: string | null;
  reason: string;
  created_at: string;
  cleared_at: string | null;
}

interface LockedStudent {
  studentId: string;
  name: string;
  email: string;
  lockLabels: string[];
  voidCount: number;
  lastVoidAt: string;
  lastReason: string;
  clearedCount: number;
}

const typeLabel = (
  type: string,
  refKey: string | null,
  weekNames: Record<string, string>,
  examNames: Record<string, string>,
) => {
  if (type === "diagnostic") return "Diagnostic";
  if (type === "weekly_quiz") return refKey ? weekNames[refKey] || `Week ${refKey} quiz` : "Weekly quiz";
  if (type === "exam") return refKey ? examNames[refKey] || `Exam ${refKey}` : "Exam";
  return type;
};

const ProctoringLocksCard = ({ courseId }: { courseId: string }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<LockedStudent[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    const { data: voids } = await supabase
      .from("assessment_attempt_voids")
      .select("id, student_id, assessment_type, ref_key, reason, created_at, cleared_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    const rows = ((voids ?? []) as unknown as VoidRow[]) || [];
    const active = rows.filter((r) => !r.cleared_at);

    const [{ data: weeks }, { data: exams }] = await Promise.all([
      supabase.from("lesson_plan_weeks").select("week_number, week_name").eq("course_id", courseId),
      supabase.from("course_exams").select("id, label").eq("course_id", courseId),
    ]);
    const weekNames: Record<string, string> = {};
    (weeks ?? []).forEach((w: any) => {
      weekNames[String(w.week_number)] = `${w.week_name || `Week ${w.week_number}`} quiz`;
    });
    const examNames: Record<string, string> = {};
    (exams ?? []).forEach((e: any) => {
      examNames[String(e.id)] = e.label || `Exam ${e.id}`;
    });

    // group active voids by student + assessment
    const byStudent = new Map<string, VoidRow[]>();
    active.forEach((r) => {
      const list = byStudent.get(r.student_id) ?? [];
      list.push(r);
      byStudent.set(r.student_id, list);
    });

    const clearedByStudent = new Map<string, number>();
    rows.filter((r) => r.cleared_at).forEach((r) => {
      clearedByStudent.set(r.student_id, (clearedByStudent.get(r.student_id) ?? 0) + 1);
    });

    const lockedIds: string[] = [];
    const partial: Record<string, { labels: string[]; count: number; last: VoidRow }> = {};
    byStudent.forEach((list, studentId) => {
      const groups = new Map<string, VoidRow[]>();
      list.forEach((r) => {
        const key = `${r.assessment_type}::${r.ref_key ?? ""}`;
        const g = groups.get(key) ?? [];
        g.push(r);
        groups.set(key, g);
      });
      const labels: string[] = [];
      groups.forEach((g) => {
        if (g.length >= VOID_LOCK_THRESHOLD) {
          labels.push(typeLabel(g[0].assessment_type, g[0].ref_key, weekNames, examNames));
        }
      });
      if (labels.length > 0) {
        lockedIds.push(studentId);
        partial[studentId] = { labels, count: list.length, last: list[0] };
      }
    });

    if (lockedIds.length === 0) {
      setStudents([]);
      setSelected([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", lockedIds);
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const result: LockedStudent[] = lockedIds.map((id) => {
      const p: any = profileById.get(id);
      const info = partial[id];
      return {
        studentId: id,
        name: p?.name || "Unknown student",
        email: p?.email || "—",
        lockLabels: info.labels,
        voidCount: info.count,
        lastVoidAt: info.last.created_at,
        lastReason: info.last.reason,
        clearedCount: clearedByStudent.get(id) ?? 0,
      };
    });
    result.sort((a, b) => a.name.localeCompare(b.name));
    setStudents(result);
    setSelected([]);
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`proctoring-locks-${courseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assessment_attempt_voids", filter: `course_id=eq.${courseId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courseId, load]);

  const allSelected = students.length > 0 && selected.length === students.length;
  const selectedLockCount = useMemo(
    () => students.filter((s) => selected.includes(s.studentId)).reduce((n, s) => n + s.lockLabels.length, 0),
    [students, selected],
  );

  const handleClear = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await clearVoids({
      courseId,
      studentIds: selected,
      clearedBy: auth?.user?.id ?? null,
    });
    setSaving(false);
    setConfirming(false);
    if (error) {
      toast.error("Could not allow retakes", { description: error });
      return;
    }
    toast.success(`Retakes allowed for ${selected.length} student${selected.length === 1 ? "" : "s"}`);
    void load();
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4" /> Proctoring locks
        </div>
        {students.length > 0 && (
          <Button size="sm" disabled={selected.length === 0} onClick={() => setConfirming(true)}>
            <Unlock className="h-3.5 w-3.5 mr-1.5" /> Allow retake
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking locked students…
        </div>
      ) : students.length === 0 ? (
        <p className="text-xs text-muted-foreground">No students are locked out of an assessment in this course.</p>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => setSelected(v ? students.map((s) => s.studentId) : [])}
            />
            Select all ({students.length})
          </label>
          <div className="divide-y rounded-md border bg-background">
            {students.map((s) => {
              const checked = selected.includes(s.studentId);
              return (
                <div key={s.studentId} className="flex items-start gap-3 p-2.5 text-xs">
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(v) =>
                      setSelected((prev) =>
                        v ? [...prev, s.studentId] : prev.filter((id) => id !== s.studentId),
                      )
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">{s.name}</span>
                      <span className="text-muted-foreground truncate">{s.email}</span>
                      {s.clearedCount > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          previously cleared {s.clearedCount}×
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.lockLabels.map((l) => (
                        <Badge key={l} variant="destructive" className="text-[10px] font-normal">
                          {l}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-muted-foreground">
                      {s.voidCount} voided attempt{s.voidCount === 1 ? "" : "s"} · last{" "}
                      {new Date(s.lastVoidAt).toLocaleDateString()} · {s.lastReason}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow retakes?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears {selectedLockCount} lock{selectedLockCount === 1 ? "" : "s"} for {selected.length} student
              {selected.length === 1 ? "" : "s"} in this course. They will be able to retake every assessment they
              were blocked from. The voided attempts stay on record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleClear();
              }}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Allow retake
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProctoringLocksCard;
