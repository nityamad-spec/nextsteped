import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Verify caller via JWT claims (signature-only; doesn't require live session)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("wipe-courses auth error:", claimsErr?.message);
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Confirm admin role
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profErr || profile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const counts: Record<string, number> = {};

    const wipeAll = async (table: string) => {
      const { count, error } = await admin
        .from(table)
        .delete({ count: "exact" })
        .not("id", "is", null);
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = count ?? 0;
    };

    // Order matters (no FK cascades in schema)
    await wipeAll("assessment_results");
    await wipeAll("assessment_questions");
    await wipeAll("diagnostic_results");
    await wipeAll("diagnostic_questions");
    await wipeAll("concepts");
    await wipeAll("course_ta_settings");
    await wipeAll("course_material_files");
    await wipeAll("course_teachers");
    await wipeAll("enrollments");

    // chat_messages where session has course_id, then chat_sessions w/ course_id
    const { data: courseSessions } = await admin
      .from("chat_sessions")
      .select("id")
      .not("course_id", "is", null);
    const sessionIds = (courseSessions ?? []).map((s: any) => s.id);
    if (sessionIds.length > 0) {
      const { count: msgCount, error: msgErr } = await admin
        .from("chat_messages")
        .delete({ count: "exact" })
        .in("session_id", sessionIds);
      if (msgErr) throw new Error(`chat_messages: ${msgErr.message}`);
      counts["chat_messages"] = msgCount ?? 0;

      const { count: sesCount, error: sesErr } = await admin
        .from("chat_sessions")
        .delete({ count: "exact" })
        .in("id", sessionIds);
      if (sesErr) throw new Error(`chat_sessions: ${sesErr.message}`);
      counts["chat_sessions"] = sesCount ?? 0;
    } else {
      counts["chat_messages"] = 0;
      counts["chat_sessions"] = 0;
    }

    // student_feedback w/ course_id
    {
      const { count, error } = await admin
        .from("student_feedback")
        .delete({ count: "exact" })
        .not("course_id", "is", null);
      if (error) throw new Error(`student_feedback: ${error.message}`);
      counts["student_feedback"] = count ?? 0;
    }

    // cache_versions scope=course
    {
      const { count, error } = await admin
        .from("cache_versions")
        .delete({ count: "exact" })
        .eq("scope", "course");
      if (error) throw new Error(`cache_versions: ${error.message}`);
      counts["cache_versions"] = count ?? 0;
    }

    await wipeAll("teacher_setup_progress");

    // Null out assigned_course_id on teacher_applications
    {
      const { count, error } = await admin
        .from("teacher_applications")
        .update({ assigned_course_id: null, assignment_type: null }, { count: "exact" })
        .not("assigned_course_id", "is", null);
      if (error) throw new Error(`teacher_applications: ${error.message}`);
      counts["teacher_applications_cleared"] = count ?? 0;
    }

    // Finally, courses
    await wipeAll("courses");

    // Storage purge: course-materials bucket, recursive
    const filesDeleted = await purgeBucket(admin, "course-materials");
    counts["storage_files"] = filesDeleted;

    return json({ ok: true, deleted: counts }, 200);
  } catch (err: any) {
    console.error("wipe-courses error:", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function purgeBucket(admin: any, bucket: string): Promise<number> {
  let total = 0;

  const walk = async (prefix: string) => {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(prefix, { limit: pageSize, offset });
      if (error) throw new Error(`storage list ${prefix}: ${error.message}`);
      if (!data || data.length === 0) break;

      const files: string[] = [];
      const folders: string[] = [];
      for (const entry of data) {
        // Folders have null id / null metadata in Supabase Storage list
        if (entry.id === null || entry.metadata === null) {
          folders.push(prefix ? `${prefix}/${entry.name}` : entry.name);
        } else {
          files.push(prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      }

      if (files.length > 0) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(files);
        if (rmErr) throw new Error(`storage remove: ${rmErr.message}`);
        total += files.length;
      }

      for (const f of folders) {
        await walk(f);
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }
  };

  await walk("");
  return total;
}
