import { supabase } from "@/integrations/supabase/client";

export interface StepProgress {
  opened: Record<string, boolean>;
  completed: Record<string, boolean>;
}

export type MarkContext = Record<string, unknown>;

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

function newRequestId(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* ignore */
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clientContext(): Record<string, unknown> {
  try {
    return {
      route: typeof window !== "undefined" ? window.location?.pathname : null,
      href: typeof window !== "undefined" ? window.location?.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      ts_client: new Date().toISOString(),
    };
  } catch {
    return {};
  }
}

/**
 * Best-effort audit log. One row per attempt — never throws.
 */
async function logAttempt(opts: {
  uid: string;
  courseId: string | null;
  stepId: string;
  action: "mark_opened" | "mark_completed";
  success: boolean;
  requestId: string;
  durationMs: number;
  payload: Record<string, unknown>;
  callerContext?: MarkContext;
  verifiedRow?: Record<string, unknown> | null;
  error?: { code?: string | null; message?: string | null; details?: string | null };
}) {
  const tag = `[setupProgress] ${opts.action} step=${opts.stepId} course=${opts.courseId ?? "null"} req=${opts.requestId}`;
  const enrichedContext = {
    request_id: opts.requestId,
    teacher_id: opts.uid,
    course_id: opts.courseId,
    step_id: opts.stepId,
    action: opts.action,
    duration_ms: opts.durationMs,
    payload: opts.payload,
    verified_row: opts.verifiedRow ?? null,
    client: clientContext(),
    caller: opts.callerContext ?? {},
  };
  if (opts.success) {
    // eslint-disable-next-line no-console
    console.info(`${tag} OK`, enrichedContext);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`${tag} FAILED`, { error: opts.error, ...enrichedContext });
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
      context: enrichedContext as any,
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
    .select("step_id, opened_at, completed_at, updated_at")
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
  callerContext?: MarkContext,
) => {
  if (!courseId) return;
  const requestId = newRequestId();
  const start = performance?.now?.() ?? Date.now();
  const payload = {
    teacher_id: uid,
    course_id: courseId,
    step_id: stepId,
    opened_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("teacher_setup_progress")
    .upsert(payload, { onConflict: "teacher_id,course_id,step_id" });
  if (error) {
    void logAttempt({
      uid, courseId, stepId, action: "mark_opened", success: false,
      requestId,
      durationMs: Math.round(((performance?.now?.() ?? Date.now()) - start)),
      payload, callerContext,
      error: { code: (error as any).code, message: error.message, details: (error as any).details },
    });
    return;
  }
  const verified = await verifyRow(uid, stepId, courseId, false);
  void logAttempt({
    uid, courseId, stepId, action: "mark_opened",
    success: !!verified,
    requestId,
    durationMs: Math.round(((performance?.now?.() ?? Date.now()) - start)),
    payload, callerContext,
    verifiedRow: verified as any,
    error: verified ? undefined : { message: "row not found after upsert (RLS or trigger swallow?)" },
  });
};

export const markStepCompleted = async (
  uid: string,
  stepId: string,
  courseId: string | null,
  callerContext?: MarkContext,
) => {
  if (!courseId) return;
  const requestId = newRequestId();
  const start = performance?.now?.() ?? Date.now();
  const nowIso = new Date().toISOString();
  const payload = {
    teacher_id: uid,
    course_id: courseId,
    step_id: stepId,
    opened_at: nowIso,
    completed_at: nowIso,
  };
  const { error } = await supabase
    .from("teacher_setup_progress")
    .upsert(payload, { onConflict: "teacher_id,course_id,step_id" });
  if (error) {
    void logAttempt({
      uid, courseId, stepId, action: "mark_completed", success: false,
      requestId,
      durationMs: Math.round(((performance?.now?.() ?? Date.now()) - start)),
      payload, callerContext,
      error: { code: (error as any).code, message: error.message, details: (error as any).details },
    });
    return;
  }
  const verified = await verifyRow(uid, stepId, courseId, true);
  void logAttempt({
    uid, courseId, stepId, action: "mark_completed",
    success: !!verified,
    requestId,
    durationMs: Math.round(((performance?.now?.() ?? Date.now()) - start)),
    payload, callerContext,
    verifiedRow: verified as any,
    error: verified ? undefined : { message: "row not found / completed_at NULL after upsert (RLS or trigger swallow?)" },
  });
};
