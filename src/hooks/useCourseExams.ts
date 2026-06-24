import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CourseExam {
  id: string;
  course_id: string;
  label: string;
  kind: "midterm" | "final";
  length_min: number;
  breakdown: Record<string, number>;
  source: "generated" | "manual";
  approved: boolean;
  position: number;
  archived_at: string | null;
  archived_by: string | null;
}

interface DBRow {
  id: string;
  course_id: string;
  label: string;
  kind: string;
  length_min: number;
  breakdown: unknown;
  source: string;
  approved: boolean;
  position: number;
  archived_at: string | null;
  archived_by: string | null;
}

const toApp = (r: DBRow): CourseExam => ({
  id: r.id,
  course_id: r.course_id,
  label: r.label,
  kind: (r.kind as "midterm" | "final") ?? "final",
  length_min: r.length_min ?? 60,
  breakdown: (r.breakdown && typeof r.breakdown === "object" ? r.breakdown : {}) as Record<string, number>,
  source: (r.source as "generated" | "manual") ?? "generated",
  approved: !!r.approved,
  position: r.position ?? 0,
  archived_at: r.archived_at,
  archived_by: r.archived_by,
});

/** Pick the next available "Final N" label that isn't taken by an ACTIVE exam. */
export function nextAvailableLabel(activeLabels: string[]): string {
  const taken = new Set(activeLabels);
  let n = 1;
  while (taken.has(`Final ${n}`)) n += 1;
  return `Final ${n}`;
}

export function useCourseExams(courseId: string | null) {
  const [exams, setExams] = useState<CourseExam[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!courseId) {
      setExams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("course_exams" as never)
      .select("*")
      .eq("course_id", courseId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Failed to load course exams:", error);
      setExams([]);
    } else {
      setExams(((data as unknown as DBRow[]) ?? []).map(toApp));
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { void reload(); }, [reload]);

  const active = exams.filter(e => !e.archived_at);
  const archived = exams.filter(e => !!e.archived_at);

  const upsertExam = useCallback(async (
    input: Partial<CourseExam> & { id: string },
  ) => {
    if (!courseId) return;
    const row: Record<string, unknown> = {
      id: input.id,
      course_id: courseId,
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.length_min !== undefined ? { length_min: input.length_min } : {}),
      ...(input.breakdown !== undefined ? { breakdown: input.breakdown } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.approved !== undefined ? { approved: input.approved } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    };
    const { error } = await supabase
      .from("course_exams" as never)
      .upsert(row as never, { onConflict: "course_id,id" });
    if (error) throw error;
  }, [courseId]);

  const archiveExam = useCallback(async (id: string, userId: string | null) => {
    if (!courseId) return;
    const { error } = await supabase
      .from("course_exams" as never)
      .update({ archived_at: new Date().toISOString(), archived_by: userId } as never)
      .eq("course_id", courseId)
      .eq("id", id);
    if (error) throw error;
    await reload();
  }, [courseId, reload]);

  const restoreExam = useCallback(async (id: string): Promise<{ renamedTo?: string }> => {
    if (!courseId) return {};
    const target = exams.find(e => e.id === id);
    if (!target) return {};
    const activeLabels = exams.filter(e => !e.archived_at && e.id !== id).map(e => e.label);
    let newLabel: string | undefined;
    if (activeLabels.includes(target.label)) {
      newLabel = nextAvailableLabel(activeLabels);
    }
    const patch: Record<string, unknown> = { archived_at: null, archived_by: null };
    if (newLabel) patch.label = newLabel;
    const { error } = await supabase
      .from("course_exams" as never)
      .update(patch as never)
      .eq("course_id", courseId)
      .eq("id", id);
    if (error) throw error;
    await reload();
    return newLabel ? { renamedTo: newLabel } : {};
  }, [courseId, exams, reload]);

  const deleteExamRow = useCallback(async (id: string) => {
    if (!courseId) return;
    const { error } = await supabase
      .from("course_exams" as never)
      .delete()
      .eq("course_id", courseId)
      .eq("id", id);
    if (error) throw error;
    await reload();
  }, [courseId, reload]);

  return {
    exams, active, archived, loading,
    reload, upsertExam, archiveExam, restoreExam, deleteExamRow,
  };
}
