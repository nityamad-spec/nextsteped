/**
 * wipe-syllabus-cascade
 *
 * Purpose:
 *   Resets a course to its pre-syllabus state — clears parsed/approved syllabus,
 *   generated lesson plan, concepts, diagnostic + exam question banks, and
 *   related teacher setup progress markers.
 *
 * Auth / Access:
 *   Bearer token of the course teacher or admin.
 *
 * Inputs:
 *   - courseId: uuid
 *
 * Steps:
 *   1. Verify caller owns/collaborates on the course (or is admin).
 *   2. Delete concepts, diagnostic_questions, assessment_questions, teaching insights.
 *   3. Remove syllabus/lesson-plan artifacts from storage under the course prefix.
 *   4. Reset teacher_setup_progress markers for syllabus/lesson-plan/concepts/diagnostic/exam.
 *   5. Bump cache_versions for scopes syllabus/concepts/questions.
 *   6. Return per-table deletion counts.
 *
 * Side effects:
 *   Deletes across setup tables + storage; cache bumps.
 */

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

// ───────────────────────────── Types ─────────────────────────────
type StepStatus = "ok" | "failed" | "skipped";
interface StepResult {
  status: StepStatus;
  durationMs: number;
  error?: string;
  errorCode?: string;       // generic: "FK_VIOLATION" | "PERMISSION" | "STORAGE_404" ...
  postgresCode?: string;    // raw PG SQLSTATE if available
  details?: Record<string, unknown>;
}

// Classify a thrown driver/storage error into a stable error code we can show
// in the audit UI without depending on free-text messages.
function classifyError(err: any): { code?: string; pg?: string; message: string } {
  const message = err?.message ?? String(err);
  const pg = err?.code; // postgres SQLSTATE (string like '23503')
  // Postgres
  if (pg === "23503") return { code: "FK_VIOLATION", pg, message };
  if (pg === "23505") return { code: "UNIQUE_VIOLATION", pg, message };
  if (pg === "42501") return { code: "PERMISSION_DENIED", pg, message };
  // Storage
  const status = err?.statusCode ?? err?.status;
  if (String(status) === "404" || err?.name === "NotFound" || err?.error === "Object not found") {
    return { code: "STORAGE_NOT_FOUND", message };
  }
  return { message };
}

// Treat a storage remove that failed because the object is gone as success.
function isStorageNotFound(err: any): boolean {
  return classifyError(err).code === "STORAGE_NOT_FOUND";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const steps: Record<string, StepResult> = {};
  let courseId = "<unknown>";
  let userId = "";
  let dryRun = false;
  const startedAt = new Date();
  const runStart = Date.now();

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
      const { code, pg, message } = classifyError(err);
      steps[id] = {
        status: "failed",
        durationMs: Date.now() - t0,
        error: message,
        errorCode: code,
        postgresCode: pg,
      };
      console.error(
        `[wipe-syllabus-cascade] step="${id}" course="${courseId}" code=${code ?? "—"} pg=${pg ?? "—"} FAILED:`,
        message,
      );
      return false;
    }
  };

  const fail = (status: number, stepId: string, message: string, extra: Record<string, unknown> = {}) => {
    if (!steps[stepId]) steps[stepId] = { status: "failed", durationMs: 0, error: message };
    return json({ ok: false, stepId, error: message, steps, ...extra }, status);
  };

  // We collect the audit insert payload to write at the end (best-effort).
  const writeAudit = async (
    admin: ReturnType<typeof createClient> | null,
    ok: boolean,
    error: string | null,
  ) => {
    if (!admin || !userId || courseId === "<unknown>") return;
    try {
      await admin.from("wipe_audit_log").insert({
        course_id: courseId,
        user_id: userId,
        dry_run: dryRun,
        ok,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - runStart,
        steps,
        error,
      });
    } catch (e: any) {
      console.error("[wipe-syllabus-cascade] audit insert failed:", e?.message ?? e);
    }
  };

  try {
    // ───── auth ─────
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

    const authOk = await runStep("auth", async () => {
      const { data, error } = await userClient.auth.getClaims(token);
      if (error || !data?.claims?.sub) throw new Error(error?.message || "Invalid token");
      userId = data.claims.sub as string;
      return { userId };
    });
    if (!authOk) return fail(401, "auth", steps.auth.error!);

    // ───── validate input ─────
    let wipeChat = false;
    const inputOk = await runStep("validate_input", async () => {
      const body = await req.json().catch(() => ({}));
      const cId = body?.courseId;
      if (!cId || typeof cId !== "string") throw new Error("courseId (string) is required");
      courseId = cId;
      dryRun = !!body?.dryRun;
      wipeChat = !!body?.wipeChat;
      // syllabusStoragePath / lessonPlanPath are accepted for back-compat but
      // ignored — paths are now derived from course_material_files.
      return { courseId: cId, dryRun, wipeChat };
    });
    if (!inputOk) return fail(400, "validate_input", steps.validate_input.error!);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ───── authorize ─────
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

      const e = new Error("Not authorized for this course");
      (e as any).code = "42501";
      throw e;
    });
    if (!authzOk) {
      await writeAudit(admin, false, steps.authorize.error!);
      const status = steps.authorize.errorCode === "PERMISSION_DENIED"
        || steps.authorize.error?.includes("Not authorized") ? 403 : 500;
      return fail(status, "authorize", steps.authorize.error!);
    }


    // ─────────────────────────── Helpers ───────────────────────────
    // Generic "delete (or count, in dry-run) all rows in `table` for this course"
    const deleteByCourse = async (table: string) => {
      if (dryRun) {
        const { count, error } = await admin
          .from(table)
          .select("course_id", { count: "exact", head: true })
          .eq("course_id", courseId);
        if (error) throw error;
        return { wouldDelete: count ?? 0, table };
      }
      const { count, error } = await admin
        .from(table)
        .delete({ count: "exact" })
        .eq("course_id", courseId);
      if (error) throw error;
      return { deleted: count ?? 0, table };
    };

    // ─────────── Phase 1: leaf rows (results + mastery) ───────────
    await runStep("assessment_results", () => deleteByCourse("assessment_results"));
    await runStep("diagnostic_results", () => deleteByCourse("diagnostic_results"));
    await runStep("student_concept_mastery", () => deleteByCourse("student_concept_mastery"));
    await runStep("student_course_mastery", () => deleteByCourse("student_course_mastery"));

    // ─────────── Phase 2: questions ───────────
    await runStep("assessment_questions", () => deleteByCourse("assessment_questions"));
    await runStep("diagnostic_questions", () => deleteByCourse("diagnostic_questions"));

    // ─────────── Phase 3: concepts (depends on phases 1+2) ───────────
    await runStep("concepts", () => deleteByCourse("concepts"));

    // ─────────── Phase 4: course-scoped resources ───────────
    await runStep("lesson_plan_weeks", () => deleteByCourse("lesson_plan_weeks"));
    await runStep("course_teaching_insights", () => deleteByCourse("course_teaching_insights"));
    await runStep("course_youtube_links", () => deleteByCourse("course_youtube_links"));
    await runStep("course_ta_settings", () => deleteByCourse("course_ta_settings"));

    // ─────────── Phase 5: storage files (driven by course_material_files) ───────────
    // Single source of truth: every file we ever uploaded to course-materials
    // for this course has a row here. Read paths, remove from storage, then
    // delete the rows.
    await runStep("storage_files", async () => {
      const { data: rows, error: selErr } = await admin
        .from("course_material_files")
        .select("storage_path")
        .eq("course_id", courseId);
      if (selErr) throw selErr;
      const registered = (rows ?? []).map((r: any) => r.storage_path).filter(Boolean) as string[];
      // Belt-and-suspenders: also remove well-known canonical JSON paths even
      // if they were never recorded in course_material_files (historical bug
      // where the upsert failed silently against a partial unique index left
      // orphaned files behind, and the lesson plan page kept rehydrating
      // from them after a wipe).
      const canonical = [
        `${courseId}/lesson-plan/published-plan.json`,
        `${courseId}/lesson-plan/draft-plan-v2.json`,
        `${courseId}/syllabus/approved-syllabus.json`,
      ];
      const paths = Array.from(new Set([...registered, ...canonical]));

      if (dryRun) {
        return { wouldRemoveFiles: paths.length, wouldRemoveRows: rows?.length ?? 0, paths };
      }

      let removedFiles = 0;
      // Storage `remove` accepts arrays — chunk to stay well under any
      // server-side limit.
      const CHUNK = 500;
      for (let i = 0; i < paths.length; i += CHUNK) {
        const slice = paths.slice(i, i + CHUNK);
        if (slice.length === 0) continue;
        const { error: rmErr } = await admin.storage.from("course-materials").remove(slice);
        if (rmErr && !isStorageNotFound(rmErr)) throw rmErr;
        removedFiles += slice.length;
      }

      const { error: delErr, count } = await admin
        .from("course_material_files")
        .delete({ count: "exact" })
        .eq("course_id", courseId);
      if (delErr) throw delErr;

      return { removedFiles, removedRows: count ?? 0, paths };
    });



    // ─────────── Phase 6: chat (opt-in) ───────────
    if (wipeChat) {
      await runStep("chat_sessions", async () => {
        const { data: sessions, error: sErr } = await admin
          .from("chat_sessions").select("id").eq("course_id", courseId);
        if (sErr) throw sErr;
        const ids = (sessions ?? []).map((s: any) => s.id);
        if (ids.length === 0) return { sessions: 0, messages: 0 };
        if (dryRun) {
          const { count: mCount, error: mErr } = await admin
            .from("chat_messages").select("id", { count: "exact", head: true }).in("session_id", ids);
          if (mErr) throw mErr;
          return { wouldDeleteSessions: ids.length, wouldDeleteMessages: mCount ?? 0 };
        }
        const { error: dmErr, count: mCount } = await admin
          .from("chat_messages").delete({ count: "exact" }).in("session_id", ids);
        if (dmErr) throw dmErr;
        const { error: dsErr, count: sCount } = await admin
          .from("chat_sessions").delete({ count: "exact" }).in("id", ids);
        if (dsErr) throw dsErr;
        return { sessions: sCount ?? 0, messages: mCount ?? 0 };
      });
    } else {
      steps.chat_sessions = { status: "skipped", durationMs: 0, details: { reason: "wipeChat=false" } };
    }

    // ─────────── Phase 7: course flags + cache bump ───────────
    await runStep("course_flags", async () => {
      if (dryRun) return { wouldReset: true };
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
      if (error) throw error;
      const cacheResults: Record<string, string> = {};
      for (const scope of ["course", "concepts", "questions"]) {
        try {
          await admin.rpc("bump_cache_version", { _scope: scope, _scope_id: courseId });
          cacheResults[scope] = "ok";
        } catch (rpcErr: any) {
          cacheResults[scope] = `failed: ${rpcErr?.message ?? String(rpcErr)}`;
        }
      }
      return { cacheBump: cacheResults };
    });

    await runStep("cache_versions", async () => {
      if (dryRun) {
        const { count, error } = await admin
          .from("cache_versions")
          .select("scope_id", { count: "exact", head: true })
          .eq("scope", "course")
          .eq("scope_id", courseId);
        if (error) throw error;
        return { wouldDelete: count ?? 0 };
      }
      // Leave the bumped rows in place; they're harmless. (No-op success.)
      return { kept: true };
    });

    // ─────────── Phase 8: setup progress ───────────
    await runStep("setup_progress", () => deleteByCourse("teacher_setup_progress"));

    // ─────────── verify ───────────
    await runStep("verify", async () => {
      if (dryRun) return { skipped: "dry run" };
      const verification: Record<string, { remaining: number; ok: boolean }> = {};
      // Some tables (e.g. course_teaching_insights) have no `id` column —
      // count by course_id which every wiped table has.
      const checkTable = async (key: string, table: string) => {
        const { count, error } = await admin
          .from(table)
          .select("course_id", { count: "exact", head: true })
          .eq("course_id", courseId);
        if (error) throw new Error(`verify ${table} failed: ${error.message}`);
        verification[key] = { remaining: count ?? 0, ok: (count ?? 0) === 0 };
      };
      for (const t of [
        "assessment_results", "assessment_questions",
        "diagnostic_results", "diagnostic_questions",
        "student_concept_mastery", "student_course_mastery",
        "concepts", "lesson_plan_weeks",
        "course_teaching_insights", "course_youtube_links", "course_ta_settings",
        "course_material_files", "teacher_setup_progress",
      ]) await checkTable(t, t);

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

    // ───── aggregate response ─────
    const failedSteps = Object.entries(steps).filter(([, r]) => r.status === "failed");
    const ok = failedSteps.length === 0;
    await writeAudit(admin, ok, ok ? null : failedSteps[0][1].error ?? "failed");

    if (!ok) {
      const [firstId, firstRes] = failedSteps[0];
      return json({
        ok: false,
        dryRun,
        stepId: firstId,
        error: firstRes.error,
        failedSteps: failedSteps.map(([id, r]) => ({
          stepId: id, error: r.error, errorCode: r.errorCode, postgresCode: r.postgresCode,
        })),
        steps,
      }, 500);
    }

    return json({ ok: true, dryRun, steps }, 200);
  } catch (err: any) {
    console.error("[wipe-syllabus-cascade] unhandled:", err);
    return json({ ok: false, stepId: "unhandled", error: err?.message ?? "Unknown error", steps }, 500);
  }
});
