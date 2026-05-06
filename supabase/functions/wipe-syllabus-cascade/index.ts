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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const courseId: string | undefined = body?.courseId;
    const syllabusStoragePath: string | undefined = body?.syllabusStoragePath;
    if (!courseId || typeof courseId !== "string") return json({ error: "courseId required" }, 400);
    if (!syllabusStoragePath || typeof syllabusStoragePath !== "string")
      return json({ error: "syllabusStoragePath required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize: caller must be course owner or collaborator (or admin)
    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", userId).maybeSingle();
    let authorized = profile?.role === "admin";
    if (!authorized) {
      const { data: course } = await admin
        .from("courses").select("teacher_id").eq("id", courseId).maybeSingle();
      if (course?.teacher_id === userId) authorized = true;
    }
    if (!authorized) {
      const { data: collab } = await admin
        .from("course_teachers").select("id")
        .eq("course_id", courseId).eq("teacher_id", userId).maybeSingle();
      if (collab?.id) authorized = true;
    }
    if (!authorized) return json({ error: "Forbidden" }, 403);

    const deleted: Record<string, number | string> = {};
    const durations: Record<string, number> = {};
    const runStep = async (id: string, fn: () => Promise<void>) => {
      const t0 = Date.now();
      try {
        await fn();
        durations[id] = Date.now() - t0;
      } catch (err: any) {
        durations[id] = Date.now() - t0;
        throw { stepId: id, message: err?.message ?? String(err) };
      }
    };

    // Fetch lesson plan paths up front
    const { data: courseRow } = await admin
      .from("courses")
      .select("lesson_plan_path, lesson_plan_draft_path")
      .eq("id", courseId)
      .maybeSingle();

    await runStep("syllabus_file", async () => {
      const { error: rmErr } = await admin.storage.from("course-materials").remove([syllabusStoragePath]);
      if (rmErr && !/not.*found/i.test(rmErr.message)) throw new Error(rmErr.message);
      const { error: delErr, count } = await admin
        .from("course_material_files")
        .delete({ count: "exact" })
        .eq("storage_path", syllabusStoragePath);
      if (delErr) throw new Error(delErr.message);
      deleted.course_material_files = count ?? 0;
    });

    await runStep("syllabus_json", async () => {
      const path = `${courseId}/syllabus/approved-syllabus.json`;
      const { error } = await admin.storage.from("course-materials").remove([path]);
      if (error && !/not.*found/i.test(error.message)) throw new Error(error.message);
    });

    await runStep("concepts", async () => {
      const { count: c1, error: e1 } = await admin
        .from("concepts").delete({ count: "exact" }).eq("course_id", courseId);
      if (e1) throw new Error(e1.message);
      deleted.concepts = c1 ?? 0;
      const { count: c2, error: e2 } = await admin
        .from("assessment_questions").delete({ count: "exact" }).eq("course_id", courseId);
      if (e2) throw new Error(e2.message);
      deleted.assessment_questions = c2 ?? 0;
    });

    await runStep("lesson_plan", async () => {
      const { count, error } = await admin
        .from("lesson_plan_weeks").delete({ count: "exact" }).eq("course_id", courseId);
      if (error) throw new Error(error.message);
      deleted.lesson_plan_weeks = count ?? 0;
      const paths = [courseRow?.lesson_plan_path, courseRow?.lesson_plan_draft_path].filter(Boolean) as string[];
      if (paths.length > 0) {
        await admin.storage.from("course-materials").remove(paths).catch(() => {});
      }
    });

    await runStep("diagnostic_questions", async () => {
      const { count, error } = await admin
        .from("diagnostic_questions").delete({ count: "exact" }).eq("course_id", courseId);
      if (error) throw new Error(error.message);
      deleted.diagnostic_questions = count ?? 0;
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
      if (error) throw new Error(error.message);
      await admin.rpc("bump_cache_version", { _scope: "course", _scope_id: courseId }).catch(() => {});
    });

    await runStep("setup_progress", async () => {
      const { count, error } = await admin
        .from("teacher_setup_progress")
        .delete({ count: "exact" })
        .eq("course_id", courseId);
      if (error) throw new Error(error.message);
      deleted.teacher_setup_progress = count ?? 0;
    });

    return json({ ok: true, deleted, durations }, 200);
  } catch (err: any) {
    if (err?.stepId) {
      return json({ error: err.message, stepId: err.stepId }, 500);
    }
    console.error("wipe-syllabus-cascade error:", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
