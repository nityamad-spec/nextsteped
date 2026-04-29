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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();
    if (callerProfile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const course_id: string | undefined = body?.course_id;
    if (!course_id) return json({ error: "Missing course_id" }, 400);

    const { data: course, error: cErr } = await admin
      .from("courses")
      .select("id, name")
      .eq("id", course_id)
      .maybeSingle();
    if (cErr) return json({ error: cErr.message }, 500);
    if (!course) return json({ error: "Course not found" }, 404);

    const counts: Record<string, number> = {};
    const del = async (table: string, filter: (q: any) => any) => {
      const { count, error } = await filter(
        admin.from(table).delete({ count: "exact" }),
      );
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = (counts[table] ?? 0) + (count ?? 0);
    };

    await del("assessment_results", (q) => q.eq("course_id", course_id));
    await del("assessment_questions", (q) => q.eq("course_id", course_id));
    await del("diagnostic_results", (q) => q.eq("course_id", course_id));
    await del("diagnostic_questions", (q) => q.eq("course_id", course_id));
    await del("concepts", (q) => q.eq("course_id", course_id));
    await del("course_ta_settings", (q) => q.eq("course_id", course_id));
    await del("lesson_plan_weeks", (q) => q.eq("course_id", course_id));

    // Storage cleanup for course material files
    const { data: matFiles } = await admin
      .from("course_material_files")
      .select("storage_path")
      .eq("course_id", course_id);
    const paths = (matFiles ?? []).map((f: any) => f.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: rmErr } = await admin.storage
        .from("course-materials")
        .remove(paths);
      if (rmErr) console.error("storage remove error:", rmErr.message);
      counts["storage_files"] = paths.length;
    }
    await del("course_material_files", (q) => q.eq("course_id", course_id));

    await del("course_teachers", (q) => q.eq("course_id", course_id));
    await del("enrollments", (q) => q.eq("course_id", course_id));

    // Chat sessions tied to this course
    const { data: sessions } = await admin
      .from("chat_sessions")
      .select("id")
      .eq("course_id", course_id);
    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    if (sessionIds.length > 0) {
      await del("chat_messages", (q) => q.in("session_id", sessionIds));
      await del("chat_sessions", (q) => q.in("id", sessionIds));
    }

    await del("student_feedback", (q) => q.eq("course_id", course_id));
    await del("teacher_setup_progress", (q) => q.eq("course_id", course_id));

    // Null out FK-like references on teacher_applications
    {
      const { count, error } = await admin
        .from("teacher_applications")
        .update({ assigned_course_id: null, assignment_type: null }, { count: "exact" })
        .eq("assigned_course_id", course_id);
      if (error) throw new Error(`teacher_applications: ${error.message}`);
      counts["teacher_applications_cleared"] = count ?? 0;
    }

    // pending_signups has a FK to courses
    await del("pending_signups", (q) => q.eq("course_id", course_id));

    // cache_versions for this course
    await del("cache_versions", (q) =>
      q.eq("scope", "course").eq("scope_id", course_id),
    );

    // Clear active_course_id on profiles pointing here
    {
      const { count, error } = await admin
        .from("profiles")
        .update({ active_course_id: null }, { count: "exact" })
        .eq("active_course_id", course_id);
      if (error) throw new Error(`profiles.active_course_id: ${error.message}`);
      counts["profiles_active_course_cleared"] = count ?? 0;
    }

    // Finally the course
    const { error: delErr } = await admin
      .from("courses")
      .delete()
      .eq("id", course_id);
    if (delErr) throw new Error(`courses: ${delErr.message}`);
    counts["courses"] = 1;

    return json({ ok: true, deleted: counts }, 200);
  } catch (err: any) {
    console.error("delete-course error:", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
