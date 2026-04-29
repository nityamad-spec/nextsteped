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
    const user_id: string | undefined = body?.user_id;
    const role: "teacher" | "student" | undefined = body?.role;
    const course_action: "block" | "transfer" = body?.course_action ?? "block";
    const transfer_to: string | undefined = body?.transfer_to;

    if (!user_id || !role || !["teacher", "student"].includes(role)) {
      return json({ error: "Missing or invalid user_id/role" }, 400);
    }
    if (user_id === callerId) {
      return json({ error: "You cannot delete your own account" }, 400);
    }

    const { data: targetProfile, error: tpErr } = await admin
      .from("profiles")
      .select("id, role, email")
      .eq("id", user_id)
      .maybeSingle();
    if (tpErr) return json({ error: tpErr.message }, 500);
    if (!targetProfile) return json({ error: "User profile not found" }, 404);
    if (targetProfile.role === "admin") {
      return json({ error: "Cannot delete an admin account" }, 400);
    }

    const counts: Record<string, number> = {};
    const targetEmail = (targetProfile.email ?? "").toLowerCase();

    const del = async (
      table: string,
      filter: (q: any) => any,
    ) => {
      const { count, error } = await filter(
        admin.from(table).delete({ count: "exact" }),
      );
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = (counts[table] ?? 0) + (count ?? 0);
    };

    if (role === "teacher") {
      // Handle owned courses
      const { data: ownedCourses, error: ocErr } = await admin
        .from("courses")
        .select("id, name")
        .eq("teacher_id", user_id);
      if (ocErr) return json({ error: ocErr.message }, 500);

      if (ownedCourses && ownedCourses.length > 0) {
        if (course_action !== "transfer" || !transfer_to) {
          return json(
            {
              error:
                "Teacher owns courses. Transfer ownership before deletion.",
              owned_courses: ownedCourses,
            },
            409,
          );
        }
        if (transfer_to === user_id) {
          return json({ error: "transfer_to must be a different teacher" }, 400);
        }
        const { data: newOwner } = await admin
          .from("profiles")
          .select("id, role")
          .eq("id", transfer_to)
          .maybeSingle();
        if (!newOwner || newOwner.role !== "teacher") {
          return json({ error: "transfer_to is not a valid teacher" }, 400);
        }

        for (const c of ownedCourses) {
          // Remove any existing collaborator entry for the new owner to avoid conflicts
          await admin
            .from("course_teachers")
            .delete()
            .eq("course_id", c.id)
            .eq("teacher_id", transfer_to);

          const { error: updErr } = await admin
            .from("courses")
            .update({ teacher_id: transfer_to, updated_at: new Date().toISOString() })
            .eq("id", c.id);
          if (updErr) throw new Error(`transfer course ${c.id}: ${updErr.message}`);

          await admin.rpc("bump_cache_version", {
            _scope: "course",
            _scope_id: c.id,
          }).catch(() => {});
        }
        counts["courses_transferred"] = ownedCourses.length;
      }

      // Now delete teacher-owned data
      await del("course_teachers", (q) => q.eq("teacher_id", user_id));
      await del("teacher_setup_progress", (q) => q.eq("teacher_id", user_id));
      if (targetEmail) {
        await del("teacher_applications", (q) => q.ilike("email", targetEmail));
      }

      // Storage cleanup for teacher's material files
      const { data: matFiles } = await admin
        .from("course_material_files")
        .select("id, storage_path")
        .eq("teacher_id", user_id);
      const paths = (matFiles ?? []).map((f: any) => f.storage_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: rmErr } = await admin.storage
          .from("course-materials")
          .remove(paths);
        if (rmErr) console.error("storage remove error:", rmErr.message);
        counts["storage_files"] = paths.length;
      }
      await del("course_material_files", (q) => q.eq("teacher_id", user_id));

      await del("assessment_questions", (q) => q.eq("teacher_id", user_id));
      await del("diagnostic_questions", (q) => q.eq("teacher_id", user_id));

      // Chat
      const { data: sessions } = await admin
        .from("chat_sessions")
        .select("id")
        .eq("user_id", user_id);
      const sessionIds = (sessions ?? []).map((s: any) => s.id);
      if (sessionIds.length > 0) {
        await del("chat_messages", (q) => q.in("session_id", sessionIds));
      }
      await del("chat_sessions", (q) => q.eq("user_id", user_id));
      await del("chat_messages", (q) => q.eq("user_id", user_id));
    } else {
      // student
      await del("assessment_results", (q) => q.eq("student_id", user_id));
      await del("diagnostic_results", (q) => q.eq("student_id", user_id));
      await del("student_feedback", (q) => q.eq("student_id", user_id));
      await del("enrollments", (q) => q.eq("student_id", user_id));

      const { data: sessions } = await admin
        .from("chat_sessions")
        .select("id")
        .eq("user_id", user_id);
      const sessionIds = (sessions ?? []).map((s: any) => s.id);
      if (sessionIds.length > 0) {
        await del("chat_messages", (q) => q.in("session_id", sessionIds));
      }
      await del("chat_sessions", (q) => q.eq("user_id", user_id));
      await del("chat_messages", (q) => q.eq("user_id", user_id));

      if (targetEmail) {
        await del("pending_signups", (q) => q.ilike("email", targetEmail));
      }
    }

    // Profile
    const { error: pErr } = await admin.from("profiles").delete().eq("id", user_id);
    if (pErr) throw new Error(`profiles: ${pErr.message}`);
    counts["profiles"] = 1;

    // Auth user
    const { error: authErr } = await admin.auth.admin.deleteUser(user_id);
    if (authErr) {
      console.error("auth.admin.deleteUser error:", authErr.message);
      return json(
        { ok: false, error: `Profile + data removed but auth deletion failed: ${authErr.message}`, deleted: counts },
        500,
      );
    }
    counts["auth_user"] = 1;

    return json({ ok: true, deleted: counts }, 200);
  } catch (err: any) {
    console.error("delete-user error:", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
