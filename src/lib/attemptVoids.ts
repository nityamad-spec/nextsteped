import { supabase } from "@/integrations/supabase/client";

export type AssessmentVoidType = "weekly_quiz" | "diagnostic" | "exam";

/** Voided attempts allowed before an assessment is locked (1 is forgiven). */
export const VOID_LOCK_THRESHOLD = 2;

/** Record a proctoring-voided attempt. Returns the new void count for that assessment. */
export async function recordAttemptVoid(params: {
  studentId: string;
  courseId: string;
  assessmentType: AssessmentVoidType;
  refKey?: string | number | null;
  reason: string;
}): Promise<number | null> {
  const { studentId, courseId, assessmentType, refKey, reason } = params;
  if (!studentId || !courseId) return null;
  const { error } = await supabase.from("assessment_attempt_voids").insert({
    student_id: studentId,
    course_id: courseId,
    assessment_type: assessmentType,
    ref_key: refKey == null ? null : String(refKey),
    reason,
  });
  if (error) {
    console.error("Failed to record voided attempt:", error);
    return null;
  }
  return countAttemptVoids({ studentId, courseId, assessmentType, refKey });
}

/** Count voided attempts for one assessment. */
export async function countAttemptVoids(params: {
  studentId: string;
  courseId: string;
  assessmentType: AssessmentVoidType;
  refKey?: string | number | null;
}): Promise<number> {
  const { studentId, courseId, assessmentType, refKey } = params;
  if (!studentId || !courseId) return 0;
  let query = supabase
    .from("assessment_attempt_voids")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("assessment_type", assessmentType);
  query = refKey == null ? query.is("ref_key", null) : query.eq("ref_key", String(refKey));
  const { count, error } = await query;
  if (error) {
    console.error("Void attempts count error:", error);
    return 0;
  }
  return count ?? 0;
}

/** Map of ref_key -> void count for one assessment type in a course. */
export async function fetchVoidCounts(params: {
  studentId: string;
  courseId: string;
  assessmentType: AssessmentVoidType;
}): Promise<Record<string, number>> {
  const { studentId, courseId, assessmentType } = params;
  if (!studentId || !courseId) return {};
  const { data, error } = await supabase
    .from("assessment_attempt_voids")
    .select("ref_key")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("assessment_type", assessmentType);
  if (error) {
    console.error("Void attempts load error:", error);
    return {};
  }
  const map: Record<string, number> = {};
  (data || []).forEach((r) => {
    const key = r.ref_key == null ? "" : String(r.ref_key);
    map[key] = (map[key] ?? 0) + 1;
  });
  return map;
}
