import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Per-step result tracker
type StepStatus = "ok" | "failed" | "skipped";
interface StepResult {
  status: StepStatus;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const steps: Record<string, StepResult> = {};
  let courseId = "<unknown>";

  // Standardized step runner: every step's success/failure is captured here.
  const runStep = async (
    id: string,
    fn: () => Promise<Record<string, unknown> | void>,
  ): Promise<boolean> => {
    const t0 = Date.now();
    try {
      const details = (await fn()) ?? undefined;
      steps[id] = { status: "ok", durationMs: Date.now() - t0, details };
      return true;
    } catch (err: any) {
      const message = err?.message ?? String(err);
      steps[id] = { status: "failed", durationMs: Date.now() - t0, error: message };
      console.error(`[wipe-syllabus-cascade] step="${id}" course="${courseId}" FAILED:`, message, err);
      return false;
    }
  };

  const fail = (status: number, stepId: string, message: string, extra: Record<string, unknown> = {}) => {
    if (!steps[stepId]) steps[stepId] = { status: "failed", durationMs: 0, error: message };
    return json({ ok: false, stepId, error: message, steps, ...extra }, status);
  };

  try {
    // ---- Step: auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail(401, "auth", "Missing or invalid Authorization header");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
      return fail(500, "auth", "Server misconfigured: missing Supabase env vars");
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");

    let userId = "";
    const authOk = await runStep("auth", async () => {
      const { data, error } = await userClient.auth.getClaims(token);
      if (error || !data?.claims?.sub) throw new Error(error?.message || "Invalid token");
      userId = data.claims.sub as string;
      return { userId };
    });
    if (!authOk) return fail(401, "auth", steps.auth.error!);

    // ---- Step: validate input ----
    const inputOk = await runStep("validate_input", async () => {
      const body = await req.json().catch(() => ({}));
      const cId = body?.courseId;
      const sPath = body?.syllabusStoragePath;
      if (!cId || typeof cId !== "string") throw new Error("courseId (string) is required");
      if (!sPath || typeof sPath !== "string") throw new Error("syllabusStoragePath (string) is required");
      courseId = cId;
      (steps as any).__input = { courseId: cId, syllabusStoragePath: sPath };
      return { courseId: cId };
    });
    if (!inputOk) return fail(400, "validate_input", steps.validate_input.error!);

    const syllabusStoragePath: string = ((steps as any).__input).syllabusStoragePath;
    delete (steps as any).__input;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---- Step: authorize ----
    const authzOk = await runStep("authorize", async () => {
      const { data: profile, error: pErr } = await admin
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (pErr) throw new Error(`profiles lookup failed: ${pErr.message}`);
      if (profile?.role === "admin") return { via: "admin" };

      const { data: course, error: cErr } = await admin
        .from("courses").select("teacher_id").eq("id", courseId).maybeSingle();
      if (cErr) throw new Error(`courses lookup failed: ${cErr.message}`);
      if (course?.teacher_id === userId) return { via: "owner" };

      const { data: collab, error: ctErr } = await admin
        .from("course_teachers").select("id")
        .eq("course_id", courseId).eq("teacher_id", userId).maybeSingle();
      if (ctErr) throw new Error(`course_teachers lookup failed: ${ctErr.message}`);
      if (collab?.id) return { via: "collaborator" };

      throw new Error("Not authorized for this course");
    });
    if (!authzOk) return fail(steps.authorize.error?.includes("Not authorized") ? 403 : 500, "authorize", steps.authorize.error!);

    // Pre-fetch lesson plan paths (used by lesson_plan step). Wrapped so any
    // failure here is also surfaced with a stepId rather than hidden.
    let lessonPlanPath: string | null = null;
    let lessonPlanDraftPath: string | null = null;
    const fetchOk = await runStep("fetch_course_paths", async () => {
      const { data, error } = await admin
        .from("courses")
        .select("lesson_plan_path, lesson_plan_draft_path")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw new Error(`courses fetch failed: ${error.message}`);
      lessonPlanPath = data?.lesson_plan_path ?? null;
      lessonPlanDraftPath = data?.lesson_plan_draft_path ?? null;
      return { lessonPlanPath, lessonPlanDraftPath };
    });
    if (!fetchOk) return fail(500, "fetch_course_paths", steps.fetch_course_paths.error!);

    // ---- Wipe steps (continue-on-failure so the UI receives a full report) ----
    await runStep("syllabus_file", async () => {
      const { error: rmErr } = await admin.storage.from("course-materials").remove([syllabusStoragePath]);
      if (rmErr && !/not.*found/i.test(rmErr.message)) {
        throw new Error(`storage remove failed: ${rmErr.message}`);
      }
      const { error: delErr, count } = await admin
        .from("course_material_files")
        .delete({ count: "exact" })
        .eq("storage_path", syllabusStoragePath);
      if (delErr) throw new Error(`course_material_files delete failed: ${delErr.message}`);
      return { removedRows: count ?? 0 };
    });

    await runStep("syllabus_json", async () => {
      const path = `${courseId}/syllabus/approved-syllabus.json`;
      const { error } = await admin.storage.from("course-materials").remove([path]);
      if (error && !/not.*found/i.test(error.message)) {
        throw new Error(`storage remove failed: ${error.message}`);
      }
      return { path };
    });

    await runStep("diagnostic_questions", async () => {
      const { count, error } = await admin
        .from("diagnostic_questions").delete({ count: "exact" }).eq("course_id", courseId);
      if (error) throw new Error(`diagnostic_questions delete failed: ${error.message}`);
      return { diagnostic_questions: count ?? 0 };
    });

    await runStep("concepts", async () => {
      const { count: c1, error: e1 } = await admin
        .from("concepts").delete({ count: "exact" }).eq("course_id", courseId);
      if (e1) throw new Error(`concepts delete failed: ${e1.message}`);
      const { count: c2, error: e2 } = await admin
        .from("assessment_questions").delete({ count: "exact" }).eq("course_id", courseId);
      if (e2) throw new Error(`assessment_questions delete failed: ${e2.message}`);
      return { concepts: c1 ?? 0, assessment_questions: c2 ?? 0 };
    });

    await runStep("lesson_plan", async () => {
      const { count, error } = await admin
        .from("lesson_plan_weeks").delete({ count: "exact" }).eq("course_id", courseId);
      if (error) throw new Error(`lesson_plan_weeks delete failed: ${error.message}`);
      const canonicalPublished = `${courseId}/lesson-plan/published-plan.json`;
      const canonicalDraft = `${courseId}/lesson-plan/draft-plan-v2.json`;
      const paths = Array.from(new Set(
        [lessonPlanPath, lessonPlanDraftPath, canonicalPublished, canonicalDraft]
          .filter(Boolean) as string[],
      ));
      let removedFiles = 0;
      if (paths.length > 0) {
        const { error: rmErr } = await admin.storage.from("course-materials").remove(paths);
        if (rmErr && !/not.*found/i.test(rmErr.message)) {
          throw new Error(`lesson plan storage remove failed: ${rmErr.message}`);
        }
        removedFiles = paths.length;
      }
      return { lesson_plan_weeks: count ?? 0, removedFiles, paths };
    });



    await runStep("course_flags", async () => {
      const { error } = await admin
        .from("courses")
        .update({
          syllabus_uploaded: false,
          syllabus_json_path: null,
          lesson_plan_path: null,
          lesson_plan_draft_path: null,
          lesson_plan_published_at: null,
          lesson_plan_overall_outcomes: null,
          published: false,
        })
        .eq("id", courseId);
      if (error) throw new Error(`courses flag update failed: ${error.message}`);
      try {
        await admin.rpc("bump_cache_version", { _scope: "course", _scope_id: courseId });
      } catch (rpcErr: any) {
        // Non-fatal — surface in details but don't fail the step.
        return { cacheBump: "failed", cacheBumpError: rpcErr?.message ?? String(rpcErr) };
      }
      return { cacheBump: "ok" };
    });

    await runStep("setup_progress", async () => {
      const { count, error } = await admin
        .from("teacher_setup_progress")
        .delete({ count: "exact" })
        .eq("course_id", courseId);
      if (error) throw new Error(`teacher_setup_progress delete failed: ${error.message}`);
      return { teacher_setup_progress: count ?? 0 };
    });

    // ---- Step: verify ----
    await runStep("verify", async () => {
      const verification: Record<string, { remaining: number; ok: boolean }> = {};
      const checkTable = async (key: string, table: string) => {
        const { count, error } = await admin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("course_id", courseId);
        if (error) throw new Error(`verify ${table} failed: ${error.message}`);
        verification[key] = { remaining: count ?? 0, ok: (count ?? 0) === 0 };
      };
      await checkTable("concepts", "concepts");
      await checkTable("lesson_plan_weeks", "lesson_plan_weeks");
      await checkTable("diagnostic_questions", "diagnostic_questions");
      await checkTable("assessment_questions", "assessment_questions");
      await checkTable("course_material_files", "course_material_files");
      await checkTable("teacher_setup_progress", "teacher_setup_progress");

      const { data: jsonList, error: listErr } = await admin.storage
        .from("course-materials")
        .list(`${courseId}/syllabus`, { search: "approved-syllabus.json", limit: 1 });
      if (listErr) throw new Error(`verify syllabus_json list failed: ${listErr.message}`);
      const jsonRemains = !!jsonList && jsonList.some((f: any) => f.name === "approved-syllabus.json");
      verification.syllabus_json = { remaining: jsonRemains ? 1 : 0, ok: !jsonRemains };

      const { data: courseAfter, error: caErr } = await admin
        .from("courses")
        .select("syllabus_json_path, syllabus_uploaded, lesson_plan_path, lesson_plan_published_at")
        .eq("id", courseId)
        .maybeSingle();
      if (caErr) throw new Error(`verify course flags failed: ${caErr.message}`);
      const flagsClean = !!courseAfter
        && !courseAfter.syllabus_json_path
        && !courseAfter.syllabus_uploaded
        && !courseAfter.lesson_plan_path
        && !courseAfter.lesson_plan_published_at;
      verification.course_flags = { remaining: flagsClean ? 0 : 1, ok: flagsClean };

      const dirty = Object.entries(verification).filter(([, v]) => !v.ok);
      if (dirty.length > 0) {
        throw new Error(
          `Verification failed: ${dirty.map(([k, v]) => `${k}=${v.remaining}`).join(", ")}`,
        );
      }
      return { verification };
    });

    // ---- Aggregate response ----
    const failedSteps = Object.entries(steps).filter(([, r]) => r.status === "failed");
    if (failedSteps.length > 0) {
      const [firstId, firstRes] = failedSteps[0];
      return json({
        ok: false,
        stepId: firstId,
        error: firstRes.error,
        failedSteps: failedSteps.map(([id, r]) => ({ stepId: id, error: r.error })),
        steps,
      }, 500);
    }

    return json({ ok: true, steps }, 200);
  } catch (err: any) {
    // Last-resort catch — should be unreachable since every step is wrapped.
    console.error("[wipe-syllabus-cascade] unhandled:", err);
    return json({ ok: false, stepId: "unhandled", error: err?.message ?? "Unknown error", steps }, 500);
  }
});
