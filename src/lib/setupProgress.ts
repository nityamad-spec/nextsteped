import { supabase } from "@/integrations/supabase/client";

export interface StepProgress {
  opened: Record<string, boolean>;
  completed: Record<string, boolean>;
}

/**
 * Fetch a teacher's setup progress for a specific course.
 * Progress is scoped per (teacher_id, course_id, step_id) so adding or
 * switching courses gives a clean slate.
 */
export const fetchStepProgress = async (
  uid: string,
  courseId: string | null,
): Promise<StepProgress> => {
  const opened: Record<string, boolean> = {};
  const completed: Record<string, boolean> = {};
  if (!courseId) return { opened, completed };

  const { data, error } = await supabase
    .from("teacher_setup_progress")
    .select("step_id, completed_at")
    .eq("teacher_id", uid)
    .eq("course_id", courseId);
  if (error || !data) return { opened, completed };
  for (const row of data) {
    opened[row.step_id] = true;
    if (row.completed_at) completed[row.step_id] = true;
  }
  return { opened, completed };
};

/**
 * Best-effort audit log. One row per attempt — never throws.
 */
async function logAttempt(opts: {
  uid: string;
  courseId: string | null;
  stepId: string;
  action: "mark_opened" | "mark_completed";
  success: boolean;
  error?: { code?: string | null; message?: string | null; details?: string | null };
  context?: Record<string, unknown>;
}) {
  const tag = `[setupProgress] ${opts.action} step=${opts.stepId} course=${opts.courseId ?? "null"}`;
  if (opts.success) {
    // eslint-disable-next-line no-console
    console.info(`${tag} OK`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`${tag} FAILED`, opts.error);
  }
  try {
    await supabase.from("setup_progress_log").insert({
      teacher_id: opts.uid,
      course_id: opts.courseId,
      step_id: opts.stepId,
      action: opts.action,
      success: opts.success,
      error_code: opts.error?.code ?? null,
      error_message: opts.error?.message ?? null,
      error_details: opts.error?.details ?? null,
      context: (opts.context ?? {}) as any,
    });
  } catch {
    /* logging must never throw */
  }
}

/** Re-read after upsert to detect silent RLS swallows. */
async function verifyRow(
  uid: string,
  stepId: string,
  courseId: string,
  expectCompleted: boolean,
) {
  const { data } = await supabase
    .from("teacher_setup_progress")
    .select("step_id, opened_at, completed_at")
    .eq("teacher_id", uid)
    .eq("course_id", courseId)
    .eq("step_id", stepId)
    .maybeSingle();
  if (!data) return null;
  if (expectCompleted && !data.completed_at) return null;
  return data;
}

export const markStepOpened = async (
  uid: string,
  stepId: string,
  courseId: string | null,
) => {
  if (!courseId) return;
  const { error } = await supabase
    .from("teacher_setup_progress")
    .upsert(
      {
        teacher_id: uid,
        course_id: courseId,
        step_id: stepId,
        opened_at: new Date().toISOString(),
      },
      { onConflict: "teacher_id,course_id,step_id" },
    );
  if (error) {
    void logAttempt({
      uid, courseId, stepId, action: "mark_opened", success: false,
      error: { code: (error as any).code, message: error.message, details: (error as any).details },
    });
    return;
  }
  const verified = await verifyRow(uid, stepId, courseId, false);
  void logAttempt({
    uid, courseId, stepId, action: "mark_opened",
    success: !!verified,
    error: verified ? undefined : { message: "row not found after upsert (RLS or trigger swallow?)" },
  });
};

export const markStepCompleted = async (
  uid: string,
  stepId: string,
  courseId: string | null,
) => {
  if (!courseId) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("teacher_setup_progress")
    .upsert(
      {
        teacher_id: uid,
        course_id: courseId,
        step_id: stepId,
        opened_at: nowIso,
        completed_at: nowIso,
      },
      { onConflict: "teacher_id,course_id,step_id" },
    );
  if (error) {
    void logAttempt({
      uid, courseId, stepId, action: "mark_completed", success: false,
      error: { code: (error as any).code, message: error.message, details: (error as any).details },
    });
    return;
  }
  const verified = await verifyRow(uid, stepId, courseId, true);
  void logAttempt({
    uid, courseId, stepId, action: "mark_completed",
    success: !!verified,
    error: verified ? undefined : { message: "row not found / completed_at NULL after upsert (RLS or trigger swallow?)" },
    context: verified ? { completed_at: verified.completed_at } : undefined,
  });
};
