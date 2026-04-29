import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json(401, { error: "Unauthorized" });

    const adminId = claimsData.claims.sub;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminProfile } = await admin
      .from("profiles").select("role").eq("id", adminId).single();
    if (adminProfile?.role !== "admin") return json(403, { error: "Forbidden: admin role required" });

    const body = await req.json().catch(() => ({}));
    const course_id = String(body?.course_id ?? "");
    const new_teacher_id = String(body?.new_teacher_id ?? "");
    const keep_previous_as_collaborator = body?.keep_previous_as_collaborator !== false;

    if (!UUID_RE.test(course_id)) return json(400, { error: "Invalid course_id" });
    if (!UUID_RE.test(new_teacher_id)) return json(400, { error: "Invalid new_teacher_id" });

    const { data: course, error: courseErr } = await admin
      .from("courses").select("id, teacher_id, name").eq("id", course_id).maybeSingle();
    if (courseErr) return json(500, { error: courseErr.message });
    if (!course) return json(404, { error: "Course not found" });

    const previous_teacher_id = course.teacher_id as string;
    if (previous_teacher_id === new_teacher_id) {
      return json(400, { error: "Selected teacher is already the owner" });
    }

    const { data: newTeacher } = await admin
      .from("profiles").select("id, role, name, email").eq("id", new_teacher_id).maybeSingle();
    if (!newTeacher) return json(404, { error: "New teacher not found" });
    if (newTeacher.role !== "teacher") {
      return json(400, { error: "Selected user is not a teacher" });
    }

    // 1) Reassign owner
    const { error: updErr } = await admin
      .from("courses")
      .update({ teacher_id: new_teacher_id, updated_at: new Date().toISOString() })
      .eq("id", course_id);
    if (updErr) return json(500, { error: `courses update: ${updErr.message}` });

    const rollback = async (reason: string) => {
      await admin.from("courses").update({ teacher_id: previous_teacher_id }).eq("id", course_id);
      return json(500, { error: reason });
    };

    // 2) Remove any existing collaborator row for the new owner (avoid dup)
    const { error: delErr } = await admin
      .from("course_teachers")
      .delete()
      .eq("course_id", course_id)
      .eq("teacher_id", new_teacher_id);
    if (delErr) return rollback(`course_teachers cleanup: ${delErr.message}`);

    // 3) Optionally keep previous owner as collaborator
    if (keep_previous_as_collaborator) {
      const { data: existing } = await admin
        .from("course_teachers")
        .select("id")
        .eq("course_id", course_id)
        .eq("teacher_id", previous_teacher_id)
        .maybeSingle();
      if (!existing) {
        const { error: insErr } = await admin.from("course_teachers").insert({
          course_id,
          teacher_id: previous_teacher_id,
          role: "collaborator",
        });
        if (insErr) return rollback(`course_teachers insert: ${insErr.message}`);
      }
    }

    // 4) Bump cache
    await admin.rpc("bump_cache_version", { _scope: "course", _scope_id: course_id });

    return json(200, {
      ok: true,
      course_id,
      previous_teacher_id,
      new_teacher_id,
      kept_previous_as_collaborator: keep_previous_as_collaborator,
    });
  } catch (e: any) {
    return json(500, { error: e?.message ?? "Unexpected error" });
  }
});
